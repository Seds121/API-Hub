-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'PENDING');

-- CreateEnum
CREATE TYPE "OrgType" AS ENUM ('PLATFORM', 'AGENCY', 'CUSTOMER');

-- CreateEnum
CREATE TYPE "OrgStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "RoleScope" AS ENUM ('PLATFORM', 'ORGANIZATION');

-- CreateEnum
CREATE TYPE "ProviderKind" AS ENUM ('RAPIDAPI', 'DIRECT_REST');

-- CreateEnum
CREATE TYPE "ProviderAuthType" AS ENUM ('NONE', 'API_KEY', 'BEARER', 'BASIC', 'OAUTH2', 'CUSTOM_HEADERS');

-- CreateEnum
CREATE TYPE "ProviderStatus" AS ENUM ('ACTIVE', 'DEGRADED', 'DOWN', 'DISABLED');

-- CreateEnum
CREATE TYPE "CredentialKind" AS ENUM ('API_KEY', 'BEARER_TOKEN', 'BASIC', 'OAUTH2_CLIENT', 'HEADERS');

-- CreateEnum
CREATE TYPE "ProviderSubscriptionStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LicenseStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "ApiStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'DISABLED');

-- CreateEnum
CREATE TYPE "HttpMethod" AS ENUM ('GET', 'POST', 'PUT', 'PATCH', 'DELETE');

-- CreateEnum
CREATE TYPE "BodyMode" AS ENUM ('NONE', 'PASSTHROUGH_VALIDATED', 'TEMPLATE');

-- CreateEnum
CREATE TYPE "PlanType" AS ENUM ('SUBSCRIPTION', 'PREPAID', 'PAYG', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "BillingInterval" AS ENUM ('MONTHLY', 'ANNUAL');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PricingScope" AS ENUM ('PRODUCT_DEFAULT', 'ENDPOINT', 'ORGANIZATION', 'AGENCY_WHOLESALE');

-- CreateEnum
CREATE TYPE "WalletTxType" AS ENUM ('TOPUP', 'USAGE_DEBIT', 'ADMIN_CREDIT', 'ADMIN_DEBIT', 'REFUND', 'SUBSCRIPTION_FEE', 'PLAN_CREDIT_GRANT', 'TRANSFER_IN', 'TRANSFER_OUT', 'REVERSAL');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('HELD', 'SETTLED', 'RELEASED');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'OPEN', 'PAID', 'VOID', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentProviderKind" AS ENUM ('STRIPE', 'PAYPAL', 'MANUAL_BANK', 'MOCK');

-- CreateEnum
CREATE TYPE "PaymentPurpose" AS ENUM ('WALLET_TOPUP', 'SUBSCRIPTION');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'REQUIRES_ACTION', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'REFUNDED', 'PARTIALLY_REFUNDED');

-- CreateEnum
CREATE TYPE "WebhookStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'FAILED', 'IGNORED');

-- CreateEnum
CREATE TYPE "ApiKeyEnvironment" AS ENUM ('LIVE', 'TEST');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('OPEN', 'PENDING', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "TicketPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('USER', 'SYSTEM', 'API_KEY');

-- CreateEnum
CREATE TYPE "AlertMetric" AS ENUM ('PROVIDER_DOWN', 'ERROR_RATE', 'LATENCY_MS', 'LOW_BALANCE', 'PROVIDER_SUBSCRIPTION_EXPIRY', 'LICENSE_EXPIRY');

-- CreateEnum
CREATE TYPE "AlertChannel" AS ENUM ('LOG', 'EMAIL', 'WEBHOOK');

-- CreateEnum
CREATE TYPE "AgreementStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "mfaSecretEnc" TEXT,
    "emailVerifiedAt" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "activeOrgId" UUID,
    "ip" TEXT,
    "userAgent" TEXT,
    "mfaVerified" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "type" "OrgType" NOT NULL DEFAULT 'CUSTOMER',
    "status" "OrgStatus" NOT NULL DEFAULT 'ACTIVE',
    "parentOrgId" UUID,
    "monthlySpendLimit" DECIMAL(18,6),
    "billingEmail" TEXT,
    "country" TEXT,
    "taxId" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "scope" "RoleScope" NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "roleId" UUID NOT NULL,
    "permissionId" UUID NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "organization_members" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "roleId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_providers" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "kind" "ProviderKind" NOT NULL,
    "description" TEXT,
    "website" TEXT,
    "baseUrl" TEXT NOT NULL,
    "allowedHosts" TEXT[],
    "authType" "ProviderAuthType" NOT NULL DEFAULT 'API_KEY',
    "authConfig" JSONB NOT NULL DEFAULT '{}',
    "defaultHeaders" JSONB NOT NULL DEFAULT '{}',
    "timeoutMs" INTEGER NOT NULL DEFAULT 10000,
    "retryMaxAttempts" INTEGER NOT NULL DEFAULT 1,
    "retryBackoffMs" INTEGER NOT NULL DEFAULT 300,
    "retryOnStatuses" INTEGER[] DEFAULT ARRAY[502, 503, 504]::INTEGER[],
    "maxConcurrency" INTEGER NOT NULL DEFAULT 20,
    "rateLimitPerMinute" INTEGER,
    "healthCheckPath" TEXT,
    "status" "ProviderStatus" NOT NULL DEFAULT 'ACTIVE',
    "isMock" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "api_providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_credentials" (
    "id" UUID NOT NULL,
    "providerId" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "kind" "CredentialKind" NOT NULL,
    "cipherText" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "authTag" TEXT NOT NULL,
    "keyVersion" INTEGER NOT NULL DEFAULT 1,
    "hint" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "rotatedAt" TIMESTAMP(3),
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_subscriptions" (
    "id" UUID NOT NULL,
    "providerId" UUID NOT NULL,
    "planName" TEXT NOT NULL,
    "externalRef" TEXT,
    "status" "ProviderSubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "monthlyFee" DECIMAL(18,6),
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "includedCalls" INTEGER,
    "usageLimitPerMonth" INTEGER,
    "usageLimitPerDay" INTEGER,
    "overagePricePerCall" DECIMAL(18,6),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_licenses" (
    "id" UUID NOT NULL,
    "providerId" UUID NOT NULL,
    "apiProductId" UUID,
    "status" "LicenseStatus" NOT NULL DEFAULT 'PENDING',
    "redistributionAllowed" BOOLEAN NOT NULL DEFAULT false,
    "subResaleAllowed" BOOLEAN NOT NULL DEFAULT false,
    "cachingAllowed" BOOLEAN NOT NULL DEFAULT false,
    "cacheTtlSeconds" INTEGER,
    "territory" TEXT,
    "restrictions" TEXT,
    "documentRef" TEXT,
    "evidenceNotes" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "verifiedById" UUID,
    "verifiedAt" TIMESTAMP(3),
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_licenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_health_checks" (
    "id" UUID NOT NULL,
    "providerId" UUID NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "statusCode" INTEGER,
    "latencyMs" INTEGER,
    "error" TEXT,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provider_health_checks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_categories" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_products" (
    "id" UUID NOT NULL,
    "internalCode" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "description" TEXT,
    "docsMarkdown" TEXT,
    "categoryId" UUID NOT NULL,
    "status" "ApiStatus" NOT NULL DEFAULT 'DRAFT',
    "tags" TEXT[],
    "logoUrl" TEXT,
    "usageRestrictions" TEXT,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "requiresSubscription" BOOLEAN NOT NULL DEFAULT false,
    "defaultRateLimitPerMinute" INTEGER NOT NULL DEFAULT 60,
    "popularity" INTEGER NOT NULL DEFAULT 0,
    "publishedAt" TIMESTAMP(3),
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "api_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_endpoints" (
    "id" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "method" "HttpMethod" NOT NULL,
    "path" TEXT NOT NULL,
    "description" TEXT,
    "params" JSONB NOT NULL DEFAULT '[]',
    "requestBodyExample" JSONB,
    "responseExample" JSONB,
    "errorCodes" JSONB,
    "maxBodyBytes" INTEGER NOT NULL DEFAULT 65536,
    "rateLimitPerMinute" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_endpoints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_integrations" (
    "id" UUID NOT NULL,
    "endpointId" UUID NOT NULL,
    "providerId" UUID NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "upstreamMethod" "HttpMethod" NOT NULL,
    "upstreamPath" TEXT NOT NULL,
    "queryMapping" JSONB NOT NULL DEFAULT '{}',
    "headerMapping" JSONB NOT NULL DEFAULT '{}',
    "bodyMode" "BodyMode" NOT NULL DEFAULT 'NONE',
    "bodyTemplate" JSONB,
    "responseTransform" JSONB,
    "timeoutMsOverride" INTEGER,
    "costPerCall" DECIMAL(18,6),
    "costIsEstimated" BOOLEAN NOT NULL DEFAULT true,
    "costCurrency" TEXT NOT NULL DEFAULT 'USD',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastTestedAt" TIMESTAMP(3),
    "lastTestOk" BOOLEAN,
    "lastTestStatus" INTEGER,
    "lastTestError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_plans" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "PlanType" NOT NULL,
    "interval" "BillingInterval",
    "price" DECIMAL(18,6) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "includedRequests" INTEGER NOT NULL DEFAULT 0,
    "overagePricePerRequest" DECIMAL(18,6),
    "creditGrant" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "discountPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "rateLimitPerMinute" INTEGER NOT NULL DEFAULT 60,
    "features" TEXT[],
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_subscriptions" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "currentPeriodStart" TIMESTAMP(3) NOT NULL,
    "currentPeriodEnd" TIMESTAMP(3) NOT NULL,
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "autoRenew" BOOLEAN NOT NULL DEFAULT true,
    "requestsUsedInPeriod" INTEGER NOT NULL DEFAULT 0,
    "externalRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pricing_rules" (
    "id" UUID NOT NULL,
    "scope" "PricingScope" NOT NULL,
    "productId" UUID,
    "endpointId" UUID,
    "orgId" UUID,
    "pricePerRequest" DECIMAL(18,6) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "discountPercent" DECIMAL(5,2),
    "minWalletBalance" DECIMAL(18,6),
    "chargeOnClientError" BOOLEAN NOT NULL DEFAULT false,
    "createdByOrgId" UUID,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pricing_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agency_agreements" (
    "id" UUID NOT NULL,
    "agencyOrgId" UUID NOT NULL,
    "status" "AgreementStatus" NOT NULL DEFAULT 'ACTIVE',
    "wholesaleDiscountPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "revenueSharePercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "maxSubaccounts" INTEGER NOT NULL DEFAULT 25,
    "allowCustomPricing" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agency_agreements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallets" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "balance" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "reserved" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "creditLimit" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "lowBalanceThreshold" DECIMAL(18,6) NOT NULL DEFAULT 5,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_transactions" (
    "id" UUID NOT NULL,
    "walletId" UUID NOT NULL,
    "type" "WalletTxType" NOT NULL,
    "amount" DECIMAL(18,6) NOT NULL,
    "balanceAfter" DECIMAL(18,6) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "description" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "actorUserId" UUID,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_reservations" (
    "id" UUID NOT NULL,
    "walletId" UUID NOT NULL,
    "correlationId" TEXT NOT NULL,
    "amount" DECIMAL(18,6) NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'HELD',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wallet_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "orgId" UUID NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'OPEN',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "subtotal" DECIMAL(18,6) NOT NULL,
    "tax" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,6) NOT NULL,
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "paymentId" UUID,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_lines" (
    "id" UUID NOT NULL,
    "invoiceId" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL,
    "unitPrice" DECIMAL(18,6) NOT NULL,
    "amount" DECIMAL(18,6) NOT NULL,

    CONSTRAINT "invoice_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "provider" "PaymentProviderKind" NOT NULL,
    "purpose" "PaymentPurpose" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "amount" DECIMAL(18,6) NOT NULL,
    "refundedAmount" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "planId" UUID,
    "externalId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "checkoutUrl" TEXT,
    "bankReference" TEXT,
    "failureReason" TEXT,
    "verifiedById" UUID,
    "createdById" UUID,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_events" (
    "id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "payload" JSONB,
    "status" "WebhookStatus" NOT NULL DEFAULT 'RECEIVED',
    "error" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_api_keys" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "createdById" UUID,
    "name" TEXT NOT NULL,
    "environment" "ApiKeyEnvironment" NOT NULL DEFAULT 'LIVE',
    "prefix" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "last4" TEXT NOT NULL,
    "scopes" TEXT[] DEFAULT ARRAY['*']::TEXT[],
    "allowedIps" TEXT[],
    "rateLimitPerMinute" INTEGER,
    "expiresAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "revokedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "customer_api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_usage_records" (
    "id" UUID NOT NULL,
    "correlationId" TEXT NOT NULL,
    "orgId" UUID NOT NULL,
    "apiKeyId" UUID,
    "productId" UUID,
    "endpointId" UUID,
    "providerId" UUID,
    "method" "HttpMethod" NOT NULL,
    "path" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "upstreamStatus" INTEGER,
    "errorCode" TEXT,
    "latencyMs" INTEGER NOT NULL,
    "upstreamLatencyMs" INTEGER,
    "billable" BOOLEAN NOT NULL DEFAULT false,
    "price" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "coveredBySubscription" BOOLEAN NOT NULL DEFAULT false,
    "requestBytes" INTEGER NOT NULL DEFAULT 0,
    "responseBytes" INTEGER NOT NULL DEFAULT 0,
    "clientIpPrefix" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_usage_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_usage_records" (
    "id" UUID NOT NULL,
    "usageRecordId" UUID NOT NULL,
    "providerId" UUID NOT NULL,
    "integrationId" UUID,
    "cost" DECIMAL(18,6),
    "costIsEstimated" BOOLEAN NOT NULL DEFAULT true,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_usage_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_tickets" (
    "id" UUID NOT NULL,
    "number" SERIAL NOT NULL,
    "orgId" UUID NOT NULL,
    "createdById" UUID NOT NULL,
    "subject" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'general',
    "status" "TicketStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "TicketPriority" NOT NULL DEFAULT 'NORMAL',
    "assigneeId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_messages" (
    "id" UUID NOT NULL,
    "ticketId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "isInternal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actorType" "ActorType" NOT NULL DEFAULT 'USER',
    "actorUserId" UUID,
    "orgId" UUID,
    "action" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT,
    "updatedById" UUID,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "alert_rules" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "metric" "AlertMetric" NOT NULL,
    "threshold" DECIMAL(18,6) NOT NULL,
    "windowMinutes" INTEGER NOT NULL DEFAULT 15,
    "providerId" UUID,
    "channel" "AlertChannel" NOT NULL DEFAULT 'LOG',
    "target" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastFiredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alert_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alert_events" (
    "id" UUID NOT NULL,
    "ruleId" UUID NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'warning',
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "alert_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_messages" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "company" TEXT,
    "topic" TEXT NOT NULL DEFAULT 'general',
    "message" TEXT NOT NULL,
    "handled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_tokenHash_key" ON "sessions"("tokenHash");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE INDEX "sessions_expiresAt_idx" ON "sessions"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE INDEX "organizations_parentOrgId_idx" ON "organizations"("parentOrgId");

-- CreateIndex
CREATE INDEX "organizations_type_status_idx" ON "organizations"("type", "status");

-- CreateIndex
CREATE UNIQUE INDEX "roles_key_key" ON "roles"("key");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_key_key" ON "permissions"("key");

-- CreateIndex
CREATE INDEX "organization_members_userId_idx" ON "organization_members"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "organization_members_orgId_userId_key" ON "organization_members"("orgId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "api_providers_slug_key" ON "api_providers"("slug");

-- CreateIndex
CREATE INDEX "provider_credentials_providerId_isActive_idx" ON "provider_credentials"("providerId", "isActive");

-- CreateIndex
CREATE INDEX "provider_subscriptions_providerId_status_idx" ON "provider_subscriptions"("providerId", "status");

-- CreateIndex
CREATE INDEX "provider_licenses_providerId_status_idx" ON "provider_licenses"("providerId", "status");

-- CreateIndex
CREATE INDEX "provider_licenses_apiProductId_idx" ON "provider_licenses"("apiProductId");

-- CreateIndex
CREATE INDEX "provider_health_checks_providerId_checkedAt_idx" ON "provider_health_checks"("providerId", "checkedAt");

-- CreateIndex
CREATE UNIQUE INDEX "api_categories_slug_key" ON "api_categories"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "api_products_internalCode_key" ON "api_products"("internalCode");

-- CreateIndex
CREATE UNIQUE INDEX "api_products_slug_key" ON "api_products"("slug");

-- CreateIndex
CREATE INDEX "api_products_status_categoryId_idx" ON "api_products"("status", "categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "api_endpoints_productId_method_path_key" ON "api_endpoints"("productId", "method", "path");

-- CreateIndex
CREATE INDEX "api_integrations_endpointId_isActive_priority_idx" ON "api_integrations"("endpointId", "isActive", "priority");

-- CreateIndex
CREATE INDEX "api_integrations_providerId_idx" ON "api_integrations"("providerId");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_plans_code_key" ON "subscription_plans"("code");

-- CreateIndex
CREATE INDEX "customer_subscriptions_orgId_status_idx" ON "customer_subscriptions"("orgId", "status");

-- CreateIndex
CREATE INDEX "customer_subscriptions_currentPeriodEnd_idx" ON "customer_subscriptions"("currentPeriodEnd");

-- CreateIndex
CREATE INDEX "pricing_rules_scope_productId_isActive_idx" ON "pricing_rules"("scope", "productId", "isActive");

-- CreateIndex
CREATE INDEX "pricing_rules_orgId_productId_idx" ON "pricing_rules"("orgId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "agency_agreements_agencyOrgId_key" ON "agency_agreements"("agencyOrgId");

-- CreateIndex
CREATE UNIQUE INDEX "wallets_orgId_key" ON "wallets"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_transactions_idempotencyKey_key" ON "wallet_transactions"("idempotencyKey");

-- CreateIndex
CREATE INDEX "wallet_transactions_walletId_createdAt_idx" ON "wallet_transactions"("walletId", "createdAt");

-- CreateIndex
CREATE INDEX "wallet_transactions_referenceType_referenceId_idx" ON "wallet_transactions"("referenceType", "referenceId");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_reservations_correlationId_key" ON "wallet_reservations"("correlationId");

-- CreateIndex
CREATE INDEX "wallet_reservations_status_expiresAt_idx" ON "wallet_reservations"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_number_key" ON "invoices"("number");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_paymentId_key" ON "invoices"("paymentId");

-- CreateIndex
CREATE INDEX "invoices_orgId_issuedAt_idx" ON "invoices"("orgId", "issuedAt");

-- CreateIndex
CREATE UNIQUE INDEX "payments_externalId_key" ON "payments"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "payments_idempotencyKey_key" ON "payments"("idempotencyKey");

-- CreateIndex
CREATE INDEX "payments_orgId_createdAt_idx" ON "payments"("orgId", "createdAt");

-- CreateIndex
CREATE INDEX "payments_status_idx" ON "payments"("status");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_events_provider_eventId_key" ON "webhook_events"("provider", "eventId");

-- CreateIndex
CREATE UNIQUE INDEX "customer_api_keys_prefix_key" ON "customer_api_keys"("prefix");

-- CreateIndex
CREATE UNIQUE INDEX "customer_api_keys_keyHash_key" ON "customer_api_keys"("keyHash");

-- CreateIndex
CREATE INDEX "customer_api_keys_orgId_revokedAt_idx" ON "customer_api_keys"("orgId", "revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "api_usage_records_correlationId_key" ON "api_usage_records"("correlationId");

-- CreateIndex
CREATE INDEX "api_usage_records_orgId_createdAt_idx" ON "api_usage_records"("orgId", "createdAt");

-- CreateIndex
CREATE INDEX "api_usage_records_productId_createdAt_idx" ON "api_usage_records"("productId", "createdAt");

-- CreateIndex
CREATE INDEX "api_usage_records_apiKeyId_createdAt_idx" ON "api_usage_records"("apiKeyId", "createdAt");

-- CreateIndex
CREATE INDEX "api_usage_records_createdAt_idx" ON "api_usage_records"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_usage_records_usageRecordId_key" ON "supplier_usage_records"("usageRecordId");

-- CreateIndex
CREATE INDEX "supplier_usage_records_providerId_createdAt_idx" ON "supplier_usage_records"("providerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "support_tickets_number_key" ON "support_tickets"("number");

-- CreateIndex
CREATE INDEX "support_tickets_orgId_status_idx" ON "support_tickets"("orgId", "status");

-- CreateIndex
CREATE INDEX "support_tickets_status_priority_idx" ON "support_tickets"("status", "priority");

-- CreateIndex
CREATE INDEX "ticket_messages_ticketId_createdAt_idx" ON "ticket_messages"("ticketId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_orgId_createdAt_idx" ON "audit_logs"("orgId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_action_createdAt_idx" ON "audit_logs"("action", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_targetType_targetId_idx" ON "audit_logs"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "alert_events_ruleId_createdAt_idx" ON "alert_events"("ruleId", "createdAt");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_parentOrgId_fkey" FOREIGN KEY ("parentOrgId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_credentials" ADD CONSTRAINT "provider_credentials_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "api_providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_subscriptions" ADD CONSTRAINT "provider_subscriptions_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "api_providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_licenses" ADD CONSTRAINT "provider_licenses_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "api_providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_licenses" ADD CONSTRAINT "provider_licenses_apiProductId_fkey" FOREIGN KEY ("apiProductId") REFERENCES "api_products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_health_checks" ADD CONSTRAINT "provider_health_checks_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "api_providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_products" ADD CONSTRAINT "api_products_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "api_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_endpoints" ADD CONSTRAINT "api_endpoints_productId_fkey" FOREIGN KEY ("productId") REFERENCES "api_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_integrations" ADD CONSTRAINT "api_integrations_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "api_endpoints"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_integrations" ADD CONSTRAINT "api_integrations_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "api_providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_subscriptions" ADD CONSTRAINT "customer_subscriptions_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_subscriptions" ADD CONSTRAINT "customer_subscriptions_planId_fkey" FOREIGN KEY ("planId") REFERENCES "subscription_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pricing_rules" ADD CONSTRAINT "pricing_rules_productId_fkey" FOREIGN KEY ("productId") REFERENCES "api_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pricing_rules" ADD CONSTRAINT "pricing_rules_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "api_endpoints"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pricing_rules" ADD CONSTRAINT "pricing_rules_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agency_agreements" ADD CONSTRAINT "agency_agreements_agencyOrgId_fkey" FOREIGN KEY ("agencyOrgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_reservations" ADD CONSTRAINT "wallet_reservations_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_api_keys" ADD CONSTRAINT "customer_api_keys_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_api_keys" ADD CONSTRAINT "customer_api_keys_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_usage_records" ADD CONSTRAINT "api_usage_records_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_usage_records" ADD CONSTRAINT "api_usage_records_apiKeyId_fkey" FOREIGN KEY ("apiKeyId") REFERENCES "customer_api_keys"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_usage_records" ADD CONSTRAINT "api_usage_records_productId_fkey" FOREIGN KEY ("productId") REFERENCES "api_products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_usage_records" ADD CONSTRAINT "api_usage_records_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "api_endpoints"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_usage_records" ADD CONSTRAINT "supplier_usage_records_usageRecordId_fkey" FOREIGN KEY ("usageRecordId") REFERENCES "api_usage_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_usage_records" ADD CONSTRAINT "supplier_usage_records_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "api_providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_usage_records" ADD CONSTRAINT "supplier_usage_records_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "api_integrations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_messages" ADD CONSTRAINT "ticket_messages_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_messages" ADD CONSTRAINT "ticket_messages_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_events" ADD CONSTRAINT "alert_events_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "alert_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;
