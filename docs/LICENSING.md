# Licensing & redistribution model

Buying an API subscription **does not** imply permission to resell it. The platform encodes this rule:

1. Each provider has `ProviderLicense` records: `redistributionAllowed`, `subResaleAllowed` (agency resale), `cachingAllowed` + TTL, territory, restrictions, document reference, evidence, validity window. A license can apply to one product or to all products of the provider.
2. New licenses start as **PENDING**. An administrator must **verify** them, which records who verified and when. Verification requires a document reference or evidence notes.
3. **Publishing** an API requires a VERIFIED, unexpired license with `redistributionAllowed` for every active upstream provider.
4. The **gateway** re-checks licensing on every request (10s cache). Revoking or rejecting a license automatically disables affected published APIs. A background job expires licenses past their end date.
5. **Agency subaccounts** can only call APIs whose license also has `subResaleAllowed`. Agencies can only set resale prices under the same condition.
6. Responses are **cached** only when the license allows it, for at most the licensed TTL, and per tenant.
7. Demo licenses (`isDemo`) from the development seed are **ignored in production**.

Before activating any real supplier, confirm with the supplier (and counsel) that redistribution under your own brand, domain and keys is permitted, and record that confirmation here.
