import config from "./member-copy.json" with { type: "json" };

const copyIndex = config.mode === "free_registration" ? 1 : 0;

export const memberCopy = key => config.text[key][copyIndex];
export const memberFaqAnswer = answer => answer.replace(config.text.aiFaq[0], memberCopy("aiFaq"));
