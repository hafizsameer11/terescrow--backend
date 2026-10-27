# Existing duplicate NIN / BVN accounts

Generated: 2026-10-27  
Scope: `KycStateTwo` rows where the same NIN or BVN appears on **more than one user**.

> New submissions are now blocked. These historical duplicates were created before the guard.

---

## Duplicate NIN (5 groups)

### NIN `58656303985` — 4 accounts (test)
| User ID | Email | Name | Status | KYC |
|---------|-------|------|--------|-----|
| 61578 | Chrisxyz093+10@gmail.com | Christopher Sangodiji | active | tier2 rejected |
| 61581 | Chrisxyz093+11@gmail.com | CHRISTOPHER SANGODIJI | active | tier3 pending |
| 61593 | Chrisxyz093+12@gmail.com | Christopher Sangodiji | active | tier2 rejected |
| 61608 | Chrisxyz093+13@gmail.com | CHRISTOPHER SANGODIJI | active | tier2 rejected |

### NIN `98989898989` — 3 accounts (test)
| User ID | Email | Name | Status |
|---------|-------|------|--------|
| 61608 | Chrisxyz093+13@gmail.com | CHRISTOPHER SANGODIJI | active |
| 61684 | Chrisxyz093+18@gmail.com | Chris Eighteen | active |
| 61689 | Chrisxyz093+20@gmail.com | Chris Twenty | active |

### NIN `12345678900` — 2 accounts (test)
| User ID | Email | Name | Status |
|---------|-------|------|--------|
| 61578 | Chrisxyz093+10@gmail.com | Christopher Sangodiji | active |
| 61593 | Chrisxyz093+12@gmail.com | Christopher Sangodiji | active |

### NIN `17236041255` — 2 accounts
| User ID | Email | Name | Status | KYC |
|---------|-------|------|--------|-----|
| 61727 | Vincentdanlami1237@gmail.com | Vincent Danlami | active | tier2 rejected |
| 61762 | Vincentdanlami858@gmail.com | Fenu Danlami | active | tier2 rejected |

### NIN `74935834507` — 2 accounts
| User ID | Email | Name | Status | KYC |
|---------|-------|------|--------|-----|
| 61698 | ishiomaalexopone29@gmail.com | Alex Opone | active | **tier2 approved** |
| 61700 | susunaendi@gmail.com | Ishioma Alex Opone | active | tier2 rejected |

---

## Duplicate BVN (21 groups with 2+ users)

### BVN `22706680342` — 4 accounts
| User ID | Email | Name | Phone |
|---------|-------|------|-------|
| 49814 | daniellazarus322@gmail.com_1764052981137 | Daniel Lazarus iro | 09061158846 |
| 49815 | daniellazarus332@gmail.com_1764046779664 | Daniel Lazarus iro | 09078281468 |
| 60401 | daniellazarus322@gmail.com_1772019423608 | Daniel Lazarus | 08138712866 |
| 60402 | daniellazarus322@gmail.com | Daniel Lazarus iro | 08138712866 |

### BVN `22282435301` — 3 accounts
| User ID | Email | Name | Phone |
|---------|-------|------|-------|
| 24719 | erilimorrison247@gmail.com_1762551358247 | Erili Morrison | 08148728495 |
| 57995 | erilimorrison247@gmail.com_1766583177563 | Morrison Erili | 09134363078 |
| 58002 | erilimorrison247@gmail.com | Morrison Ogagaoghene Erili | 09134363078 |

### BVN pairs (2 accounts each)

| BVN | Accounts |
|-----|----------|
| `22647083006` | 15750 maimakosamaila62@gmail.com · 44851 viviansung666@gmail.com_* |
| `91579847614` | 31928 meshmeskack@gmail.com_* · 31931 meshmeskack@gmail.com |
| `22832327724` | 59508 smalllvoice758@gmail.com_* · 59509 smalllvoice758@gmail.com |
| `22822964007` | 15238 taylorky24@gmail.com · 34470 trkinney6@gmail.com |
| `22819956602` | 59016 thankgodafuruku7@gmail.com_* · 59017 thankgodafuruku4@gmail.com |
| `22816136908` | 1542 dawsonwillliamsmyprivate@gmail.com · 8201 managementofkevincostner1000@gmail.com |
| `22808894232` | 46651 godstimelast994@gmail.com · 60821 mathewgodstime146@gmail.com |
| `22767064240` | 3490 Aprealagodgift19@gmail.com_* · 6716 Aprealagodgift19@gmail.com |
| `22762532016` | 11234 thomasadariku193@gmail.com_* · 11663 odeymicheal708@gmail.com |
| `22687651821` | 5227 rollinsstanley555@gmail.com_* · 5239 rollinsstanley555@gmail.com |
| `22153970463` | 61578 Chrisxyz093+10@gmail.com · 61581 Chrisxyz093+11@gmail.com |
| `22555596726` | 555 gstainless9@gmail.com · 1779 goldstainless86@gmail.com |
| `22525385826` | 11206 omohiaokpaclinton@gmail.com · 12473 Bestgilbert213@gmail.com |
| `22481385263` | 1599 ezekielaigbomobe80@gmail.com_* · 1683 ezekielaigbomobe80@gmail.com |
| `22452476600` | 29840 Fawolesefiu3240@gmail.com_* · 30020 Femiadebayo3240@gmail.com |
| `22396576062` | 59019 mosesisreal6188@gmail.com_* · 59023 mosesisreal6188@gmail.com |
| `22366578913` | 2123 Osamujames02@gmail.com_* · 4176 osamujames02@gmail.com |
| `22226706054` | 58170 Kwaleboi@gmail.com_* · 58172 Kwaleboi@gmail.com |
| `22221251656` | 2226 albertcares45@gmail.com_* · 2228 albertcares45@gmail.com |

`_*` = soft-deleted / renamed email suffix from account recycle.

---

## Permanent VA BVN duplicates

None found.

---

## Notes

- Many duplicates are the **same person** with recreated accounts (email suffix timestamps).
- Highest-priority real conflict: NIN `74935834507` — one **approved** Tier 2 (`ishiomaalexopone29`) and another rejected (`susunaendi`).
- Enforcement now blocks **new** Tier 2 / Tier 3 / PalmPay VA submissions when another user already holds that NIN or BVN (including banned accounts).
