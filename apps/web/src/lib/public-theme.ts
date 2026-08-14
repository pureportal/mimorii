import { useLayoutEffect, useState } from "react";

export type PublicTheme = "light" | "dark";

const PUBLIC_THEME_KEY = "mimorii.public-theme";

function getInitialTheme(): PublicTheme {
  const savedTheme = window.localStorage.getItem(PUBLIC_THEME_KEY);
  if (savedTheme === "light" || savedTheme === "dark") return savedTheme;
  return "dark";
}

export function usePublicTheme() {
  const [theme, setTheme] = useState<PublicTheme>(getInitialTheme);

  useLayoutEffect(() => {
    const root = document.documentElement;
    const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    const previousColorScheme = root.style.colorScheme;
    const previousThemeColor = themeColor?.content;
    root.dataset.publicTheme = theme;
    root.style.colorScheme = theme;
    if (themeColor) themeColor.content = theme === "dark" ? "#0c0f1b" : "#f8f6f1";

    return () => {
      delete root.dataset.publicTheme;
      root.style.colorScheme = previousColorScheme;
      if (themeColor && previousThemeColor) themeColor.content = previousThemeColor;
    };
  }, [theme]);

  return {
    theme,
    toggleTheme: () =>
      setTheme((currentTheme) => {
        const nextTheme = currentTheme === "light" ? "dark" : "light";
        window.localStorage.setItem(PUBLIC_THEME_KEY, nextTheme);
        return nextTheme;
      }),
  };
}
