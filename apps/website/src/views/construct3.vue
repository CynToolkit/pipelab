<template>
  <div>
    <section class="hero">
      <div class="container">
        <div class="grid hero-grid">
          <div class="col-12">
            <div class="hero-content">
              <h1 class="hero-title fade-in">Pipelab for Construct 3 Users</h1>
              <p class="hero-description fade-in-delay">
                Streamline your Construct 3 game development with Pipelab's
                powerful automation tools. From asset compression to deployment,
                focus on creating amazing games while we handle the pipeline.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="benefits">
      <div class="container">
        <h2 class="section-title text-center mb-5 fade-in">
          Why Pipelab for Construct 3?
        </h2>
        <div class="grid">
          <div
            class="col-12 sm:col-12 md:col-6 lg:col-4 p-3 fade-in-delay"
            v-for="benefit in benefits"
            :key="benefit.title"
          >
            <div class="benefit-card">
              <div class="benefit-card-icon">
                <i :class="benefit.icon"></i>
              </div>
              <h3>{{ benefit.title }}</h3>
              <p>{{ benefit.description }}</p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="cta">
      <div class="container text-center">
        <h2 class="fade-in">Ready to enhance your Construct 3 workflow?</h2>
        <Button
          label="Download now"
          class="p-button-lg mt-3 fade-in-delay primary-btn"
          icon="pi pi-arrow-right"
          iconPos="right"
          as="router-link"
          :to="{ name: 'Download' }"
        ></Button>
      </div>
    </section>
  </div>
</template>

<script lang="ts" setup>
import { ref } from "vue";
import Button from "primevue/button";
import "primeflex/primeflex.css";
import "primeicons/primeicons.css";

interface Benefit {
  title: string;
  description: string;
  icon: string;
}

const benefits = ref<Benefit[]>([
  {
    title: "Steam Overlay Working Out of the Box",
    description:
      "Seamlessly integrate overlays into your Construct 3 games without complex setup. Pipelab handles the configuration automatically.",
    icon: "pi pi-eye",
  },
  {
    title: "Steam Integration",
    description:
      "Full Steam integration including achievements, stats, leaderboards, and workshop support. Deploy directly to Steam with ease.",
    icon: "pi pi-trophy",
  },
  {
    title: "Gamepad Support",
    description:
      "Built-in gamepad support for enhanced player experience. Pipelab ensures compatibility across multiple controllers and platforms.",
    icon: "pi pi-play",
  },
  {
    title: "Cross-Platform Packaging",
    description:
      "Package your Construct 3 games for Windows, macOS, Linux and Steamdeck with a single click. Optimized builds for each platform.",
    icon: "pi pi-desktop",
  },
  {
    title: "Asset Optimization",
    description:
      "Automatic asset compression and optimization to reduce file sizes and improve loading times without quality loss.",
    icon: "pi pi-images",
  },
  {
    title: "Easy Deployment",
    description:
      "Deploy to multiple platforms including itch.io, Steam, and custom servers. Manage updates and patches effortlessly.",
    icon: "pi pi-cloud-upload",
  },
]);
</script>

<style lang="scss" scoped>
.primary-btn {
  text-decoration: none;
}

.primary-btn:not(.p-button-outlined) {
  background: var(--primary-color) !important;
  border-color: var(--primary-color) !important;
  color: white !important;
}

.hero {
  background-color: var(--surface-ground);
  padding: 4rem 0;
}

.hero-grid {
  justify-content: center;
}

.hero-content {
  text-align: center;
}

.hero-title {
  font-size: 3.5rem;
  font-weight: 700;
  margin: 0;
  line-height: 1.2;
  color: var(--text-color);
  margin-bottom: 1rem;
}

.hero-description {
  font-size: 1.25rem;
  margin-top: 1.5rem;
  margin-bottom: 2rem;
}

.container {
  max-width: 1300px;
  margin: 0 auto;
  padding: 0 1rem;

  @media (min-width: 640px) {
    padding: 0 2rem;
  }
}

.benefits {
  padding: 2rem 0 4rem;
  background: #fff;
}

.section-title {
  font-size: 2.5rem;
  color: var(--text-color);
  margin-bottom: 2rem;
}

.benefit-card {
  background-color: #fff;
  border-radius: 16px;
  padding: 1rem 2rem;
  height: 100%;
  box-shadow: 0px 0px 8px rgba(0, 0, 0, 0.05);
  transition: transform 0.3s ease, box-shadow 0.3s ease;
  position: relative;
  border: 1px solid #f1f1f1;

  &:hover {
    transform: translateY(-5px);
    box-shadow: 0 6px 12px rgba(0, 0, 0, 0.15);
  }

  h3 {
    color: var(--text-color);
    margin-top: 1rem;
    margin-bottom: 0.5rem;
  }
}

.benefit-card-icon {
  font-size: 2.5rem;
  color: var(--primary-color);
  margin-bottom: 1rem;
}

.cta {
  background-color: #fff;
  padding: 4rem 0;
  text-align: center;

  h2 {
    font-size: 2.5rem;
    color: var(--text-color);
    margin-bottom: 2rem;
  }
}

@media (max-width: 768px) {
  .hero-title {
    font-size: 2.5rem;
  }

  .hero-description {
    font-size: 1rem;
  }

  .benefit-card {
    margin-bottom: 1rem;
  }
}

// Subtle fade-in animations
.fade-in {
  animation: fadeIn 0.8s ease-out;
}

.fade-in-delay {
  animation: fadeIn 0.8s ease-out 0.2s both;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(20px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
