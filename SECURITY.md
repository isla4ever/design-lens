# Security Policy

## Supported Versions

The latest `0.2.x` release and the current `main` branch receive security fixes
while Design Lens remains in alpha.

## Reporting A Vulnerability

Do not open a public issue for vulnerabilities involving captured page data,
extension permissions, local API keys, exported evidence, or code execution.
Use GitHub's private security advisory form:

https://github.com/isla4ever/design-lens/security/advisories/new

Include the affected build, reproduction steps, impact, and whether the issue
requires the standard or Collector build. Remove real credentials and private
page content from reports. You should receive an initial response within seven
days.

## Security Boundaries

- The standard build must not request Chrome's `debugger` permission.
- Collector access is optional, visible, and limited to explicitly authorized
  Rebuild capture and export actions.
- Captures must not read cookies, local storage values, request headers/bodies,
  credentials, or unmasked form values.
- The extension must not automatically submit, pay, log in, delete, or navigate
  to unknown destinations.
