import bank from '../../database/alignment_work_style_v3.json' with { type: 'json' };

export const QUESTION_VERSION = bank.version;
export const QUESTIONS = bank.questions;
export const DIMENSIONS = bank.dimensions;
export { selectAnswer, canContinue, answerText } from './alignment-flow.mjs';
