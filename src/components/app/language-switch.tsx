"use client";

import { Check, Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { LOCALE_NAMES, LOCALES } from "@/lib/i18n/locale";
import { useI18n } from "@/lib/i18n/provider";

export function LanguageSwitch() {
  const { locale, setLocale, t } = useI18n();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="sm" aria-label={`${t.language}: ${LOCALE_NAMES[locale]}`} className="gap-1.5 px-2" />
        }
      >
        <Languages aria-hidden />
        <span className="text-xs font-semibold uppercase">{locale}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-36">
        {LOCALES.map((option) => (
          <DropdownMenuItem key={option} onClick={() => setLocale(option)} lang={option}>
            <span className="flex-1">{LOCALE_NAMES[option]}</span>
            {option === locale && <Check aria-hidden className="size-4 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
