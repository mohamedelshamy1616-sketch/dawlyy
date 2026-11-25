# PT ledger opening credits

Mohamed, how should a client package receive its opening PT credit in wave 1?

The subscription snapshot in `packages/db/src/schema/packages.ts` captures package entitlements, duration and price. The entitlement model supports a custom key with a per-subscription limit, but defines no PT session key. For a package already in use, even a known quantity sold does not establish how many visits the desk has already counted.

I recommend letting the owner enter the verified remaining session count once per subscription as an opening credit. For a new sale this is the quantity sold. For an existing package it is the desk's reconciled remainder. This would add an owner funding action alongside the requested dispute correction action. Should wave 1 include it, or is there an existing authoritative source for opening credits that the ledger should use?
