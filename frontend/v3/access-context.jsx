import React, { createContext, useContext } from "react";
export const AccessContext = createContext({ session: null });
export const useAccess = () => useContext(AccessContext);
