import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

const color = (token: string) => `var(--syntax-${token})`;

/** SQL highlighting driven by the theme's `syntax-*` colors (CSS variables), so a theme change needs no editor reload. */
export const themeHighlighting = syntaxHighlighting(
  HighlightStyle.define([
    { tag: [t.comment, t.lineComment, t.blockComment], color: color("comment") },
    { tag: [t.keyword, t.operatorKeyword, t.controlKeyword, t.definitionKeyword, t.modifier], color: color("keyword") },
    { tag: [t.string, t.special(t.string)], color: color("string") },
    { tag: [t.number, t.bool, t.null, t.atom], color: color("number") },
    { tag: [t.function(t.variableName), t.standard(t.name), t.labelName], color: color("function") },
    { tag: [t.typeName, t.className], color: color("type") },
    { tag: [t.operator, t.punctuation], color: color("operator") },
    { tag: [t.name, t.variableName, t.propertyName, t.special(t.name)], color: color("variable") },
  ]),
);
