---
name: ecomm-ref-payments-adr-policy-001-pci-dss-compliance
description: PCI-DSS compliance requirements applicable to ecomm payment flows. Use when designing, reviewing, or auditing any component that stores, processes, or transmits cardholder data.
apply-to: All ecomm services handling cardholder data or payment flows
valid-from: 2026-07-06
---

# ecomm-ref-payments-adr-policy-001: PCI-DSS compliance

## Context and Problem Statement

The ecomm platform processes card payments. Any service that stores, processes, or transmits cardholder data is in scope for PCI-DSS (Payment Card Industry Data Security Standard). Non-compliance exposes the business to fines, card network penalties, and reputational damage.

Which PCI-DSS requirements apply to the ecomm platform and how MUST they be adopted?

## Decision Outcome

**All ecomm services in scope for PCI-DSS MUST map their implementation against the requirements in this policy and demonstrate compliance at each applicable control.**

This is a reference policy. Team scopes SHOULD link to specific rules here when documenting how their implementation satisfies each control.

### Details

#### 01-cardholder-data-scope

Any service that stores, processes, or transmits Primary Account Numbers (PAN), cardholder names, expiry dates, or service codes is considered in-scope for PCI-DSS. The scope boundary MUST be documented by each team owning in-scope services.

#### 02-encryption-at-rest

Cardholder data stored at rest MUST be encrypted using AES-256 or a stronger algorithm. Encryption keys MUST be stored separately from the data they protect and MUST be rotated at least annually.

#### 03-encryption-in-transit

Cardholder data in transit MUST be protected using TLS 1.2 or higher. TLS 1.0 and TLS 1.1 MUST NOT be used for in-scope connections. Certificates MUST be from a trusted Certificate Authority and MUST be renewed before expiry.

#### 04-access-control

Access to cardholder data MUST be restricted to individuals and services with a documented business need. Access MUST be granted on a least-privilege basis and MUST be reviewed at least quarterly.

#### 05-tokenisation-preferred

Where feasible, cardholder data SHOULD be replaced with tokens at the earliest point of entry to reduce the PCI-DSS scope surface. Direct PAN storage SHOULD be avoided in application databases.

#### 06-audit-logging

All access to cardholder data MUST be logged with a timestamp, actor identity, and action type. Logs MUST be retained for at least 12 months and MUST be protected against modification.

## References

- PCI Security Standards Council — PCI-DSS v4.0 (https://www.pcisecuritystandards.org)
