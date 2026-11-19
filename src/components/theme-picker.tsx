import { Palette, Check, Monitor } from "lucide-react";
import { THEMES, useTheme } from "@/hooks/use-theme";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

export function ThemePicker() {
  const { theme, setTheme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="tvGhost" size="lg" aria-label="Change theme">
          <Palette className="h-5 w-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel>Theme</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {THEMES.map((t) => (
          <DropdownMenuItem
            key={t.id}
            onClick={() => setTheme(t.id)}
            className="flex items-center justify-between gap-3 cursor-pointer"
          >
            <span className="flex items-center gap-2">
              {t.id === "system" && <Monitor className="h-3.5 w-3.5 text-muted-foreground" />}
              <span className={theme === t.id ? "font-semibold" : ""}>{t.label}</span>
            </span>
            <span className="flex items-center gap-2">
              <span className="flex">
                {t.swatches.map((c, i) => (
                  <span
                    key={i}
                    className="h-4 w-4 -ml-1 first:ml-0 rounded-full border border-black/40"
                    style={{ background: c }}
                  />
                ))}
              </span>
              {theme === t.id && <Check className="h-3.5 w-3.5 text-primary" />}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
