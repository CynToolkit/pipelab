<template>
  <div class="terms-page">
    <section class="content-section">
      <div class="container">
        <h1 class="section-title mb-6">Terms of Service</h1>
        <p class="last-updated mb-8">Last Updated: April 21, 2026</p>

        <div class="terms-content">
          <section class="mb-8">
            <h2 class="mb-4">1. Acceptance of Terms</h2>
            <p>
              By accessing or using Pipelab, you agree to be bound by these Terms of Service and all applicable laws and regulations. If you do not agree with any of these terms, you are prohibited from using or accessing this service.
            </p>
          </section>

          <section class="mb-8">
            <h2 class="mb-4">2. User Accounts</h2>
            <p>
              When you create an account with us, you must provide information that is accurate, complete, and current at all times. Failure to do so constitutes a breach of the Terms, which may result in immediate termination of your account.
            </p>
            <p>
              You are responsible for safeguarding the password that you use to access the service and for any activities or actions under your password.
            </p>
          </section>

          <section class="mb-8">
            <h2 class="mb-4">3. Intellectual Property</h2>
            <p>
              The Service and its original content (excluding content provided by users), features, and functionality are and will remain the exclusive property of Pipelab and its licensors. Our trademarks and trade dress may not be used in connection with any product or service without the prior written consent of Pipelab.
            </p>
          </section>

          <section class="mb-8">
            <h2 class="mb-4">4. Acceptable Use</h2>
            <p>
              You agree not to use the Service:
            </p>
            <ul class="ml-4 mt-2">
              <li>In any way that violates any applicable national or international law or regulation.</li>
              <li>To transmit, or procure the sending of, any advertising or promotional material, including any "junk mail", "chain letter," "spam," or any other similar solicitation.</li>
              <li>To impersonate or attempt to impersonate Pipelab, a Pipelab employee, another user, or any other person or entity.</li>
              <li>To engage in any other conduct that restricts or inhibits anyone's use or enjoyment of the Service.</li>
            </ul>
          </section>

          <section class="mb-8">
            <h2 class="mb-4">5. Limitation of Liability</h2>
            <p>
              In no event shall Pipelab, nor its directors, employees, partners, agents, suppliers, or affiliates, be liable for any indirect, incidental, special, consequential or punitive damages, including without limitation, loss of profits, data, use, goodwill, or other intangible losses, resulting from:
            </p>
            <ul class="ml-4 mt-2">
              <li>Your access to or use of or inability to access or use the Service.</li>
              <li>Any conduct or content of any third party on the Service.</li>
              <li>Any content obtained from the Service.</li>
              <li>Unauthorized access, use or alteration of your transmissions or content.</li>
            </ul>
          </section>

          <section class="mb-8">
            <h2 class="mb-4">6. Disclaimer</h2>
            <p>
              Your use of the Service is at your sole risk. The Service is provided on an "AS IS" and "AS AVAILABLE" basis. The Service is provided without warranties of any kind, whether express or implied.
            </p>
          </section>

          <section class="mb-8">
            <h2 class="mb-4">7. Termination</h2>
            <p>
              We may terminate or suspend your account immediately, without prior notice or liability, for any reason whatsoever, including without limitation if you breach the Terms.
            </p>
          </section>

          <section class="mb-8">
            <h2 class="mb-4">8. Governing Law</h2>
            <p>
              These Terms shall be governed and construed in accordance with the laws of the jurisdiction in which Pipelab operates, without regard to its conflict of law provisions.
            </p>
          </section>

          <section class="mb-8">
            <h2 class="mb-4">9. Contact Us</h2>
            <p>
              If you have any questions about these Terms, please contact us at:
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
// No specific logic needed
</script>

<style lang="scss" scoped>
.terms-page {
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

.terms-content {
  line-height: 1.6;
  color: var(--text-color);

  h2 {
    font-size: 1.75rem;
    font-weight: 700;
    color: var(--primary-color);
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
