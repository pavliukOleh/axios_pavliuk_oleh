import js from "@eslint/js";
import globals from "globals";
export default [
  js.configs.recommended,
  { files:["**/*.js"],
    languageOptions:{ ecmaVersion:"latest", sourceType:"module", globals:{...globals.node,...globals.browser} },
    rules:{
      complexity:["warn",10],
      "max-depth":["warn",4],
      "max-lines-per-function":["warn",{max:60,skipBlankLines:true,skipComments:true}],
      "max-params":["warn",4],
      "max-statements":["warn",30],
      "max-nested-callbacks":["warn",3],
      "no-param-reassign":"warn",
      eqeqeq:["warn","smart"],
      "no-unused-vars":"warn",
      "prefer-const":"warn",
      "no-var":"warn"
    } } ];
