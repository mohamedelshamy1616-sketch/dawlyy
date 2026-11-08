/** doc 13.2: the factory facade. The factories live in fixtures.ts (batch SEC-X3); suites may import them from here. */
export { mkTenant, mkClient, mkMembership, mkPackage, mkSubscription, mkPayment, mkVersion, mkSession, buildPrivateFixture } from './fixtures';
