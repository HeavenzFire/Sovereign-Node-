# HeavenzFire Guardian Protection — v0.1

A first, deliberately narrow build for protecting children and vulnerable families.

## Components

- \`index.html\`: a static public information page. It does not accept reports, upload files, run analytics, or send case details to an AI provider.
- \`vault.py\`: a local-only encrypted evidence vault CLI. It encrypts files before writing them to the vault, records SHA-256 hashes inside the encrypted envelope, and can verify/decrypt stored cases.
- \`tests/test_vault.py\`: automated tests for encryption, integrity verification, duplicate IDs, and invalid inputs.

## Important safety boundary

This is an early technical prototype, **not a production child-protection reporting system** and not a substitute for emergency services, legal counsel, a trained advocate, or a mandated reporter's applicable procedures.

- If a child or another person is in immediate danger, contact local emergency services.
- In the United States, the Childhelp National Child Abuse Hotline can be reached at **1-800-422-4453**. If it is unsafe to call from a monitored device, use a safer device and seek help from a trusted professional.
- Do not upload identifying details, images, or allegations about a child to a public repository, public issue, or public website.
- Do not use this prototype to publish accusations or investigate a suspected person yourself. Preserve originals and refer concerns to qualified authorities or advocates.
- Hashes help detect changes to a file after capture; they do not prove that the contents are true, who created them, or whether collection was lawful.
- The public page deliberately has no case-submission form. A production intake service needs a reviewed threat model, secure hosting, abuse controls, privacy/legal review, retention policy, incident response, and a safe way to contact reporters.

## Requirements

- Python 3.10+
- \`cryptography\` package

Install from this directory:

\`\`\`powershell
py -m pip install -r requirements.txt
py -m unittest discover -s tests -v
\`\`\`

## Local vault quick start (PowerShell)

Choose a vault directory and keep the key outside it. The key is essential: if it is lost, encrypted cases cannot be recovered. The PowerShell wrapper uses `%LOCALAPPDATA%` by default.

From this folder:

```powershell
py -m pip install -r .\requirements.txt
.\GuardianVault.ps1 Init
.\GuardianVault.ps1 Add -File "C:\path\to\copy-of-evidence.pdf"
.\GuardianVault.ps1 List
.\GuardianVault.ps1 Verify
.\GuardianVault.ps1 Export -CaseId <CASE_ID> -OutFile "C:\trusted-location\recovered-file.bin"
```

Choose a vault directory and keep the key outside it. The key is essential: if it is lost, encrypted cases cannot be recovered.

\`\`\`powershell
$Vault = Join-Path $env:LOCALAPPDATA "HeavenzFire\\GuardianVault\\cases"
$Key = Join-Path $env:LOCALAPPDATA "HeavenzFire\\GuardianVault\\vault.key"
py .\\vault.py init --vault $Vault --key $Key
py .\\vault.py add --vault $Vault --key $Key --file "C:\\path\\to\\copy-of-evidence.pdf"
py .\\vault.py list --vault $Vault
py .\\vault.py verify --vault $Vault --key $Key
\`\`\`

Use a **working copy** where possible; do not edit or overwrite source evidence. The encrypted vault does not delete the source file. Store the key separately from vault backups and protect it with Windows account permissions and device encryption. This prototype does not configure Windows ACLs for you and does not defend against malware, an administrator, or a compromised logged-in account.

Export a case only to a trusted destination:

\`\`\`powershell
py .\\vault.py export --vault $Vault --key $Key --case-id <CASE_ID> --out "C:\\trusted-location\\recovered-file.bin"
\`\`\`

The export uses the original filename recorded inside the encrypted envelope only when the operator chooses a destination path; the CLI writes to the exact path supplied with \`--out\`.

## Current limitations

- Local CLI only; no remote vault API, browser upload, cloud sync, AI analysis, or automatic reporting.
- The index contains random case IDs, UTC creation timestamps, and encrypted byte sizes; original filenames and plaintext hashes are inside the encrypted case envelope.
- The encryption key is a local key file, not a password-derived key. Anyone who obtains both the vault and key can decrypt the cases.
- No automatic deletion, evidence alteration, public accusations, or direct contact with a subject of an allegation.
- This release has not undergone an independent security audit.

## Development

Run tests before changes:

\`\`\`powershell
py -m unittest discover -s tests -v
\`\`\`
