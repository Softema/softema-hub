# Redesign, 2. kolo: snímky k posouzení

Větev `redesign/dashboard`, produkční build, Chromium na Windows, ukázková data (datum prototypu 25. 9. 2026). Přípona `-light` / `-dark` označuje téma.

| Snímek | Co ukazuje |
| --- | --- |
| `prehled-1920-*`, `prehled-1440-*`, `prehled-1024-*` | Dashboard: samostatné KPI karty, sjednocená šířka obsahu, nižší graf |
| `prehled-390-*` | Telefon: celá stránka a první obrazovka se spodní navigací (`-viewport`) |
| `shell-1920x1080-*` | Sidebar na 1920 × 1080 bez posouvání, odstup loga od přepínače prostoru |
| `kontakty-1440-*`, `kontakty-390-light` | Seznam kontaktů: kontrast textů, záložky bez rámečků |
| `kontakty-1-1440-*`, `kontakty-1-390-dark` | Detail kontaktu: vlastní pole v levém sloupci pod štítky, na telefonu viditelné |
| `notifications-1440-*`, `notifications-390-light` | Notifikace jako panel pod zvonkem |
| `tag-menu-*` | Opravená nabídka „Přidat štítek“ se zvýrazněnou položkou |
| `theme-menu-dark`, `period-help-light` | Přepínač tématu a nápověda ke srovnávacímu období |
| `editor-1440-dark` | Editor v tmavém tématu; obsah newsletteru zůstává ve vlastním designu |
| `menu-390-dark` | Celé mobilní menu včetně spodních akcí |

Původní referenční snímky v `e2e/__screenshots__/` nejsou přepsané.
