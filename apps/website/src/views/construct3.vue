<template>
  <div class="construct-page">
    <section class="construct-hero">
      <div class="construct-container">
        <p class="eyebrow">Construct 3 + Pipelab</p>
        <h1>Take your Construct project into a release workflow.</h1>
        <p class="intro">
          Select your <code>.c3p</code> project and a local Chromium profile.
          Pipelab exports a web game that you can build or send to a compatible
          destination.
        </p>
        <div class="actions">
          <RouterLink class="primary-action" :to="{ name: 'Download' }"
            >Download Pipelab</RouterLink
          >
          <a href="https://docs.pipelab.app/guide/integrations/construct"
            >Read the Construct guide
            <i class="pi pi-arrow-up-right" aria-hidden="true"
          /></a>
        </div>
      </div>
    </section>

    <section
      class="construct-container details"
      aria-labelledby="construct-steps"
    >
      <div class="details-heading">
        <h2 id="construct-steps">From project file to artifact</h2>
        <p>These are the parts you configure in a Release workflow.</p>
      </div>
      <ol>
        <li>
          <span class="number">01</span>
          <div>
            <h3>Choose your project</h3>
            <p>
              Use a <code>.c3p</code> file and a Chromium profile that can open
              Construct. Both paths are required.
            </p>
          </div>
        </li>
        <li>
          <span class="number">02</span>
          <div>
            <h3>Configure the output</h3>
            <p>
              The source produces a web directory. Add a compatible build or
              destination and complete its settings before shipping.
            </p>
          </div>
        </li>
        <li>
          <span class="number">03</span>
          <div>
            <h3>Review the run</h3>
            <p>
              Check export and delivery status in Runs, then find available
              outputs in Artifacts.
            </p>
          </div>
        </li>
      </ol>
      <p class="requirements">
        Desktop packaging depends on the selected build, target, host, and local
        toolchain. Steam publishing has additional account and host
        requirements.
        <a href="https://docs.pipelab.app/guide/release-workflows"
          >See Release workflows</a
        >.
      </p>
    </section>
  </div>
</template>

<style scoped>
.construct-page {
  color: #111942;
  background: #fff;
}
.construct-container {
  max-width: 1080px;
  margin: 0 auto;
  padding: 0 32px;
}
.construct-hero {
  background: linear-gradient(125deg, #fff 30%, #f5f3ff 100%);
  border-bottom: 1px solid #e8e9f5;
  padding: 105px 0 110px;
}
.eyebrow {
  color: #5751c2;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  margin: 0 0 22px;
}
h1 {
  max-width: 900px;
  font-size: clamp(42px, 5vw, 68px);
  line-height: 1.06;
  letter-spacing: -0.05em;
  margin: 0;
}
.intro {
  max-width: 690px;
  color: #596585;
  font-size: 20px;
  line-height: 1.55;
  margin: 25px 0 30px;
}
.actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 14px 25px;
}
.actions a {
  display: inline-flex;
  align-items: center;
  min-height: 48px;
  gap: 8px;
  color: #3928d5;
  font-weight: 700;
  text-decoration: none;
}
.actions .primary-action {
  background: #4b3cf2;
  border-radius: 7px;
  color: white;
  padding: 0 24px;
}
a:hover {
  text-decoration: underline;
}
.actions .primary-action:hover {
  background: #3628d4;
  text-decoration: none;
}
a:focus-visible {
  outline: 3px solid #3928d5;
  outline-offset: 3px;
}
.details {
  padding-top: 80px;
  padding-bottom: 90px;
}
.details-heading h2 {
  font-size: clamp(30px, 3vw, 42px);
  line-height: 1.15;
  letter-spacing: -0.04em;
  margin: 0 0 12px;
}
.details-heading p {
  color: #596585;
  font-size: 18px;
  margin: 0;
}
ol {
  list-style: none;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 32px;
  padding: 0;
  margin: 44px 0;
}
li {
  border-top: 2px solid #dcdcf8;
  padding-top: 18px;
}
.number {
  color: #5751c2;
  font-size: 13px;
  font-weight: 800;
}
h3 {
  margin: 16px 0 8px;
  font-size: 19px;
}
li p,
.requirements {
  color: #596585;
  line-height: 1.55;
  margin: 0;
}
.requirements {
  border-top: 1px solid #dcdcf8;
  padding-top: 24px;
}
.requirements a {
  color: #3928d5;
}
@media (max-width: 700px) {
  .construct-container {
    padding-left: 20px;
    padding-right: 20px;
  }
  .construct-hero {
    padding: 65px 0 70px;
  }
  .intro {
    font-size: 17px;
  }
  .details {
    padding-top: 60px;
    padding-bottom: 65px;
  }
  ol {
    grid-template-columns: 1fr;
    gap: 22px;
  }
}
</style>
