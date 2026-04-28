import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  // 신규 react-compiler 룰들이 기존 코드의 정상적인 패턴(데이터 fetch
  // 중 setState, "n분 전" 표시용 Date.now() 등)을 다수 잡아냄. 빌드는
  // 정상이므로 warn 으로 다운그레이드해 향후 리팩토링 후보로 가시화만
  // 유지. 진짜 위험한 위반은 react-hooks/rules-of-hooks 가 따로 잡음.
  {
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/refs": "warn",
      // react-compiler 가 memoization 을 자동 적용 못 한 경우 알림 —
      // 빌드/실행에는 영향 없음.
      "react-hooks/preserve-manual-memoization": "warn",
    },
  },
]);

export default eslintConfig;
