import globals from "globals";
import path from "node:path";
import { fileURLToPath } from "node:url";
import js from "@eslint/js";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
    baseDirectory: __dirname,
    recommendedConfig: js.configs.recommended,
    allConfig: js.configs.all
});

export default [{
    ignores: ["**/node_modules", "**/dist", "**/out", "**/.gitignore"],
}, ...compat.extends(
    "plugin:vue/vue3-recommended",
    "eslint:recommended",
    "@vue/eslint-config-typescript/recommended",
    "@vue/eslint-config-prettier",
), {
    languageOptions: {
        globals: {
            ...globals.browser,
            ...globals.commonjs,
            ...globals.node,
            ...vue.environments["setup-compiler-macros"]["setup-compiler-macros"],
        },
    },

    rules: {
        "@typescript-eslint/ban-ts-comment": ["error", {
            "ts-ignore": "allow-with-description",
        }],

        "@typescript-eslint/explicit-module-boundary-types": "off",

        "@typescript-eslint/no-empty-function": ["error", {
            allow: ["arrowFunctions"],
        }],

        "@typescript-eslint/no-explicit-any": "warn",
        "@typescript-eslint/no-non-null-assertion": "off",
        "@typescript-eslint/no-var-requires": "off",
        "vue/require-default-prop": "off",
        "vue/multi-word-component-names": "off",
    },
}, {
    files: ["**/*.js"],

    rules: {
        "@typescript-eslint/explicit-function-return-type": "off",
    },
}];