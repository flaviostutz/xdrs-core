---
name: checkout-adr-policy-001-payment-gateway-selection
description: Decides which payment gateway the checkout flow uses for card processing and defines the constraints governing that choice and future gateway changes.
apply-to: Checkout team services handling card payment authorisation
valid-from: 2026-07-06
---

# checkout-adr-policy-001: Payment gateway selection

## Context and Problem Statement

The checkout flow requires a payment gateway to authorise card transactions. Multiple gateways are available (Stripe, Adyen, Braintree, etc.), each with different pricing models, regional availability, PCI-DSS compliance certifications, and integration complexity.

Choosing the wrong gateway increases integration cost, limits regional expansion, or introduces compliance gaps. A clear decision is needed to align the team and avoid re-evaluating the choice on each new feature.

Which payment gateway MUST the checkout flow use for card authorisation, and what constraints govern changes to this decision?

## Decision Outcome

**The checkout flow MUST use Stripe as the primary payment gateway for card authorisation.**

Stripe is selected because it is PCI-DSS Level 1 certified, supports all target markets, provides a hosted fields integration that minimises PAN scope in ecomm services, and has an established integration with the `ecomm-plat-cloud` infrastructure.

### Details

#### 01-primary-gateway

The checkout service MUST use Stripe for all card payment authorisations. No other gateway MAY be used for primary card processing without updating this policy.

#### 02-pci-scope-reduction

The integration MUST use Stripe's hosted fields (Stripe.js / Payment Element) so that PAN data is submitted directly to Stripe without passing through ecomm servers. This keeps the checkout service outside PCI-DSS cardholder data scope per `ecomm-ref-payments-adr-policy-001.05-tokenisation-preferred`.

#### 03-fallback-gateway

A secondary gateway MAY be configured as a fallback for availability incidents. If a fallback is configured, it MUST also be PCI-DSS Level 1 certified and MUST be approved by the platform team before activation.

#### 04-gateway-change-process

Replacing the primary gateway requires a new policy version or a superseding policy. The decision MUST NOT be made by the checkout team unilaterally; it requires sign-off from the platform team and a compliance review against `ecomm-ref-payments-adr-policy-001`.

## References

- [ecomm-ref-payments-adr-policy-001](../../../ecomm-ref-payments/adrs/principles/001-pci-dss-compliance.md) — PCI-DSS compliance requirements
- [ecomm-plat-cloud-adr-policy-001](../../../ecomm-plat-cloud/adrs/application/001-cloud-regions.md) — Cloud regions and deployment constraints
