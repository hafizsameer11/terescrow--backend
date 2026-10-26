# Busha customer create + KYC — quick guide (Terescrow)

Short reference for **why KYC gets auto-rejected** on another app, and how Terescrow handled Busha customer create / field types.

Official docs: [Create individual](https://docs.busha.io/guides/customers/create-individual) · [Verify identity](https://docs.busha.io/guides/customers/verify-identity) · [Changelog (NIN)](https://docs.busha.io/changelog)

---

## 1. Correct sequence (must do all three)

```
1) POST /v1/customers          → create CUS_…
2) PUT  /v1/customers/{id}     → attach identifying_information (+ address, birth_date)
3) POST /v1/customers/{id}/verify  → start verification
```

Then wait for webhook / poll until status is `active` or `rejected`.

**Common mistake:** create customer + attach docs but **never call `/verify`** → stays inactive / in_review forever, or looks “rejected” in your UI.

On Terescrow, admin path is: `updateCustomer` (KYC docs) → `verifyCustomer`.

---

## 2. Create customer — required fields

`POST /v1/customers`

| Field | Type / value | Notes |
|--------|----------------|--------|
| `type` | `"individual"` | Required |
| `email` | string | Unique per Busha business |
| `first_name` | string | Should match NIN registry name |
| `last_name` | string | Should match NIN registry name |
| `phone` | `+234…` | International format |
| `country_id` | `"NG"` | ISO alpha-2 |
| `birth_date` | **`DD-MM-YYYY`** | e.g. `15-06-1990` — **not** `YYYY-MM-DD` |
| `has_accepted_terms` | `true` | |
| `address` | object | See below |

**Address object**

```json
{
  "city": "Lagos",
  "state": "Lagos",
  "country_id": "NG",
  "address_line_1": "10 Allen Avenue",
  "postal_code": "100001"
}
```

Terescrow normalizes phone to `+234…` and birth date via `toBushaBirthDate()` → always `DD-MM-YYYY`, age ≥ 18.

---

## 3. KYC document types (`identifying_information`)

Allowed `type` strings (exact):

| `type` | When | Extra fields |
|--------|------|----------------|
| `national-id` | Nigeria NIN (recommended) | `number` (11 digits), `country: "NG"` — **no ID image** |
| `selfie` | Always with ID option | `image_front` (base64), `number: ""`, `country: "NG"` |
| `passport` | Passport path | `number`, `country`, **`image_front` required** |
| `drivers-license` | License path | `number`, `country`, **`image_front` required** |
| `bvn` | Optional extra | `number`, `country: "NG"` — for virtual NGN accounts, not standard KYC |

### Nigeria path Terescrow uses (NIN + selfie)

```json
"identifying_information": [
  {
    "type": "national-id",
    "number": "12345678901",
    "country": "NG"
  },
  {
    "type": "selfie",
    "image_front": "<raw base64, no data:image/... prefix>",
    "number": "",
    "country": "NG"
  }
]
```

**Important (Busha changelog 2026/07/06):**  
For **NIN / `national-id`**, do **not** send `image_front` / `image_back` on the national-id object. Only NIN number + selfie. Sending a scanned NIN slip as `image_front` on `national-id` is a common auto-reject cause.

Terescrow code explicitly skips doc image when `documentType === 'national-id'`.

### Passport / drivers-license

```json
[
  {
    "type": "passport",
    "number": "A12345678",
    "country": "NG",
    "image_front": "<base64>"
  },
  {
    "type": "selfie",
    "image_front": "<base64>",
    "number": "",
    "country": "NG"
  }
]
```

---

## 4. Image rules

- Format: **Base64 only**
- Strip `data:image/jpeg;base64,` prefix before send (Terescrow `stripBase64DataUrl`)
- Size: **&lt; 4MB** each
- Selfie must be a real face photo (not blank / tiny file)

---

## 5. Why auto-reject happens (checklist for the other app)

| Likely cause | What to fix |
|--------------|-------------|
| Wrong `birth_date` format | Use `DD-MM-YYYY` only |
| Name ≠ NIN registry | `first_name` / `last_name` must match NIMC |
| DOB ≠ NIN registry | Same DOB as on NIN |
| `national-id` + card/slip image | Remove `image_front` from national-id; NIN number + selfie only |
| Wrong type string | Use `national-id`, not `nin` / `NIN` / `national_id` |
| Selfie missing / bad / too big | Valid selfie base64 &lt; 4MB |
| Never called `/verify` | Call `POST /v1/customers/{id}/verify` after PUT |
| Duplicate email/phone | Already used on another Busha customer |
| Phone without country code | Use `+234…` |
| Sandbox vs live keys | Use matching env + real test identities where required |
| Putting BVN as `national-id` | Use `type: "bvn"` separately; NIN is `national-id` |

Rejection is usually **Busha compliance matching** (name/DOB/NIN/selfie), not your HTTP 200 on create.

---

## 6. Minimal working example (NG NIN)

```http
POST /v1/customers
Authorization: Bearer {SECRET}

{
  "type": "individual",
  "email": "user@example.com",
  "first_name": "Ada",
  "last_name": "Okafor",
  "phone": "+2348012345678",
  "country_id": "NG",
  "birth_date": "15-06-1990",
  "has_accepted_terms": true,
  "address": {
    "city": "Lagos",
    "state": "Lagos",
    "country_id": "NG",
    "address_line_1": "10 Allen Avenue",
    "postal_code": "100001"
  },
  "identifying_information": [
    { "type": "national-id", "number": "12345678901", "country": "NG" },
    { "type": "selfie", "image_front": "<base64>", "number": "", "country": "NG" }
  ]
}
```

Then:

```http
POST /v1/customers/{CUS_id}/verify
Authorization: Bearer {SECRET}
```

(Or create without KYC → `PUT` with same `identifying_information` → `/verify`.)

---

## 7. Terescrow code map

| Piece | File |
|-------|------|
| Birth date → `DD-MM-YYYY` | `src/services/busha/busha.kyc.service.ts` → `toBushaBirthDate` |
| Doc types + NIN without image | `src/services/admin/busha.admin.service.ts` → `buildIdentifyingInformation` |
| Create / update / verify API | `src/services/busha/busha.client.ts` |
| Full product guide | `docs/BUSHA_INTEGRATION_GUIDE.md` §4 |

**Note:** On this Terescrow deploy, **new** Busha customer create is gated (`BUSHA_ALLOW_CUSTOMER_CREATE`) during Obiex migration. The field shapes above are still what worked / what Busha expects.

---

## 8. Debug tip for the other app

Log Busha’s full error body on create/update/verify. Also `GET /v1/customers/{id}` and read:

- `status` (`inactive` | `in_review` | `active` | `rejected`)
- any rejection / verification message in the payload

If status is `rejected`, fix identity data (name/DOB/NIN/selfie) and resubmit KYC + `/verify` — don’t only recreate with the same mismatched fields.
