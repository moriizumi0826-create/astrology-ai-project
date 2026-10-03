"""Durable quota in production; isolated in-memory equivalent for local_test only."""
import os
from datetime import datetime, timedelta, timezone
from threading import Lock
from uuid import UUID
from zoneinfo import ZoneInfo
from fastapi import HTTPException

JST=ZoneInfo('Asia/Tokyo')

def daily_limit():
    try:
        value=int(os.getenv('V3_MAP_ASSISTANT_DAILY_LIMIT','20'))
        if not 1<=value<=1000: raise ValueError()
        return value
    except ValueError:
        raise HTTPException(503,'AIの回数制限設定を確認してください。') from None

class LocalChatQuota:
    def __init__(self,clock=lambda:datetime.now(timezone.utc)):
        self.clock=clock
        self.rows={}
        self.lock=Lock()

    def call(self,user,action,token,limit):
        with self.lock:
            now=self.clock(); today=now.astimezone(JST).date(); error=None
            self.rows={k:r for k,r in self.rows.items() if r['date']>=today-timedelta(days=30) and (r['success'] or r['expires']>now)}
            if action in ('success','failure'):
                row=self.rows.get(token)
                if not row or row['user']!=user: error='expired'
                elif action=='success': row['success']=True
                elif not row['success']: del self.rows[token]
            rows=[r for r in self.rows.values() if r['user']==user and r['date']==today]
            used=sum(r['success'] for r in rows); held=len(rows)-used
            if action=='reserve':
                if used+held>=limit: error='limit'
                else:
                    self.rows[token]={'user':user,'date':today,'success':False,'expires':now+timedelta(minutes=10)}
                    held+=1
            return {'error':error,'limit':limit,'used':used,'reserved':held,'remaining':max(0,limit-used-held),
                    'date':str(today),'reset_at':datetime.combine(today+timedelta(days=1),datetime.min.time(),JST).isoformat()}

def quota(request,user,action='status',token=None):
    limit=daily_limit()
    # Only the explicit local-test auth backend may use process memory.
    if request.app.state.v3_environment=='local' and hasattr(request.app.state,'local_test_auth'):
        if user == 'local-test-user':
            return {'error': None, 'unlimited': True, 'limit': None, 'remaining': None,
                    'reset_at': None}
        return request.app.state.map_chat_local_quota.call(user,action,token,limit)
    store=getattr(getattr(request.app.state,'billing',None),'store',None)
    if not store or not store.configured or not str(user).startswith('supabase:'):
        raise HTTPException(503,'AIの回数管理を確認できません。時間をおいて再試行してください。')
    # SupabaseAuth returns supabase:<project>:<uuid>, not supabase:<uuid>.
    try:
        namespace, project, subject = user.split(':')
        if namespace != 'supabase' or not project:
            raise ValueError()
        subject = str(UUID(subject))
    except ValueError: raise HTTPException(401,'ログインを確認してください。') from None
    result=store.request('POST','rpc/v3_map_chat_quota',json={'p_user_id':subject,'p_action':action,'p_token':token,'p_limit':limit})
    if not isinstance(result,dict) or 'remaining' not in result:
        raise HTTPException(503,'AIの回数管理を確認できません。')
    return result
