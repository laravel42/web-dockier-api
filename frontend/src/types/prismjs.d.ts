declare module "prismjs" {
  interface Grammar {
    [key: string]: unknown;
  }

  interface Util {
    encode(value: string): string;
  }

  const languages: Record<string, Grammar>;
  const util: Util;

  function highlight(text: string, grammar: Grammar, language: string): string;

  export default { languages, util, highlight };
}

declare module "prismjs/components/*";
