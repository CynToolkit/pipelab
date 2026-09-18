<template>
  <div class="privacy-page">
    <section class="content-section">
      <div class="container">
        <h1 class="section-title mb-6">Privacy Policy</h1>
        <p class="last-updated mb-8">Last Updated: April 21, 2026</p>

        <div class="privacy-content">
          <section class="mb-8">
            <h2 class="mb-4">1. Introduction</h2>
            <p>
              Welcome to Pipelab. We are committed to protecting your privacy and providing you with a safe automation experience. This Privacy Policy explains how we collect, use, and safeguard your information when you visit our website or use the Pipelab desktop application.
            </p>
          </section>

          <section class="mb-8">
            <h2 class="mb-4">2. Information We Collect</h2>

            <h3 class="mb-2 mt-4">Website Analytics</h3>
            <p>
              We collect anonymous website usage statistics to understand how visitors interact with our site. This information is collected in a privacy-respecting manner that does not track personally identifiable information (PII) or use cookies for tracking purposes.
            </p>

            <h3 class="mb-2 mt-4">Product Analytics & Telemetry</h3>
            <p>
              To improve our services and prioritize development, we collect telemetry data regarding how you interact with the Pipelab application. This includes feature usage, performance metrics, and general technical information about your device and operating system. You may opt-out of this data collection within the application settings.
            </p>

            <h3 class="mb-2 mt-4">Account & Infrastructure</h3>
            <p>
              If you choose to create an account, we collect necessary information such as your email address and authentication credentials. This data is used to provide core services, including account security and optional cloud-sync features.
            </p>

            <h3 class="mb-2 mt-4">Payments & Sponsorships</h3>
            <p>
              When you contribute to Pipelab via a sponsorship or subscription, your transaction is handled by a secure third-party payment processor. We receive information about the contribution level and your account association, but we do not store sensitive payment details like credit card numbers on our infrastructure.
            </p>
          </section>

          <section class="mb-8">
            <h2 class="mb-4">3. Data Residency & Security</h2>
            <p>
              Pipelab follows a local-first design philosophy. Most of your data, including automation workflows and encrypted secrets, resides primarily on your local machine.
            </p>
            <ul class="ml-4 mt-2">
              <li><strong>Local Storage:</strong> Your primary data remains under your control on your local device.</li>
              <li><strong>Encryption:</strong> Sensitive information (such as API keys or integrations) is encrypted before being stored.</li>
              <li><strong>Cloud Sync:</strong> If you explicitly enable synchronization features, your data is transmitted over secure channels and stored in protected environments.</li>
            </ul>
          </section>

          <section class="mb-8">
            <h2 class="mb-4">4. Your Rights</h2>
            <p>
              You have the right to access, correct, or delete your personal data. If you have an account, you can manage your data within the application or by contacting us directly.
            </p>
          </section>

          <section class="mb-8">
            <h2 class="mb-4">5. Contact Us</h2>
            <p>
              If you have any questions about this Privacy Policy, please contact us at:
              <br />
              <strong>Email:</strong> <a href="mailto:contact@pipelab.app">contact@pipelab.app</a>
            </p>
          </section>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
// No specific logic needed for the privacy page
</script>

<style lang="scss" scoped>
.privacy-page {
  padding-top: 4rem;
  padding-bottom: 6rem;
  background-color: var(--surface-ground);
  min-height: calc(100vh - 80px);
}

.content-section {
  .container {
    max-width: 800px;
    margin: 0 auto;
    padding: 0 1.5rem;
  }
}

.section-title {
  font-size: 3rem;
  font-weight: 800;
  color: var(--text-color);
}

.last-updated {
  color: #666;
  font-style: italic;
}

.privacy-content {
  line-height: 1.6;
  color: var(--text-color);

  h2 {
    font-size: 1.75rem;
    font-weight: 700;
    color: var(--primary-color);
  }

  h3 {
    font-size: 1.25rem;
    font-weight: 600;
  }

  p {
    margin-bottom: 1rem;
  }

  ul {
    list-style-type: disc;
    margin-bottom: 1rem;

    li {
      margin-bottom: 0.5rem;
    }
  }

  a {
    color: var(--primary-color);
    text-decoration: none;
    font-weight: 500;

    &:hover {
      text-decoration: underline;
    }
  }
}
</style>
