import { IconMoon, IconSun } from "@tabler/icons-react";
import { Button } from "./Button";
import { useTheme } from "./theme";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <Button
      variant="quiet"
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      onPress={toggleTheme}
    >
      {isDark
        ? <IconSun className="h-5 w-5" />
        : <IconMoon className="h-5 w-5" />}
    </Button>
  );
}

export default ThemeToggle;
