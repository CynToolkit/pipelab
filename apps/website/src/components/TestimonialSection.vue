<template>
  <section class="testimonials" id="testimonials">
    <div class="container">
      <div class="testimonial-header">
        <h2 class="testimonial-title">Testimonial Section</h2>
      </div>
      <div class="testimonial-list">
        <div class="testimonial-card" v-for="(testimonial, i) in testimonials" :key="testimonial.name">
          <div class="testimonial-card-text">{{ testimonial.text }}</div>
          <div class="testimonial-card-footer">
            <img :src="testimonial.avatar" class="testimonial-avatar" alt="Avatar" />
            <div class="testimonial-meta">
              <div class="testimonial-name">
                <a v-if="testimonial.authorLink" :href="testimonial.authorLink" target="_blank">
                  {{ testimonial.name }}
                  <svg class="link-icon" xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 20 20" fill="none"><path d="M7.5 12.5L12.5 7.5M12.5 7.5H8.75M12.5 7.5V11.25" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </a>
                <span v-else>{{ testimonial.name }}</span>
              </div>
              <div class="testimonial-role" v-if="testimonial.game">
                <a v-if="testimonial.gameLink" :href="testimonial.gameLink" target="_blank">
                  {{ testimonial.game }}
                  <svg class="link-icon" xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 20 20" fill="none"><path d="M7.5 12.5L12.5 7.5M12.5 7.5H8.75M12.5 7.5V11.25" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </a>
                <span v-else>{{ testimonial.game }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { testimonials } from '@/data/testimonials';
</script>

<style scoped>
.testimonials {
  background: #f9f9fb;
  padding: 4rem 0 3rem 0;
}

.testimonials a {
  color: inherit;
  text-decoration: none;
}
.link-icon {
  display: inline-block;
  vertical-align: middle;
  margin-left: 0;
  font-size: 1em;
  width: 1em;
  height: 1em;
  stroke: currentColor;
  opacity: 0.7;
  transition: opacity 0.15s;
}
.testimonials a:hover .link-icon {
  opacity: 1;
}


testimonial-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  margin-bottom: 2.5rem;
  flex-wrap: wrap;
}
.testimonial-tagline {
  font-size: 0.95rem;
  font-weight: 600;
  letter-spacing: 1.2px;
  color: #222;
  opacity: 0.7;
  margin-bottom: 0.5rem;
}
.testimonial-title {
  font-size: 2.4rem;
  font-weight: 700;
  color: #14082d;
  margin: 0 0 0.5rem 0;
  flex: 1 1 100%;
  text-align: center;
}
.testimonial-nav {
  display: flex;
  gap: 1rem;
  margin-left: auto;
}
.arrow-btn {
  background: #fff;
  border: none;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  box-shadow: 0 2px 6px rgba(20,8,45,0.08);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #14082d;
  font-size: 1.1rem;
  cursor: pointer;
  transition: background 0.2s;
}
.arrow-btn.active, .arrow-btn:hover {
  background: #14082d;
  color: #fff;
}
.testimonial-list {
  display: flex;
  flex-direction: row;
  gap: 2rem;
  justify-content: center;
}
.testimonial-card {
  background: #fff;
  border-radius: 18px;
  box-shadow: 0 6px 32px rgba(20,8,45,0.07);
  padding: 2.2rem 2rem 1.5rem 2rem;
  max-width: 350px;
  min-width: 260px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  align-items: flex-start;
  transition: box-shadow 0.2s;
  margin-bottom: 0;
}
.testimonial-card-title {
  font-size: 1.22rem;
  font-weight: 700;
  color: #14082d;
  margin-bottom: 1rem;
}
.testimonial-card-text {
  font-size: 1.01rem;
  color: #444;
  margin-bottom: 1.7rem;
  min-height: 46px;
}
.testimonial-card-footer {
  display: flex;
  align-items: center;
  gap: 0.85rem;
}
.testimonial-avatar {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid #f0f0f0;
}
.testimonial-meta {
  display: flex;
  flex-direction: column;
}
.testimonial-name {
  font-weight: 600;
  font-size: 1rem;
  color: #14082d;
}
.testimonial-role {
  font-size: 0.93rem;
  color: #14082d;
}
@media (max-width: 900px) {
  .testimonial-list {
    flex-direction: column;
    align-items: center;
  }
  .testimonial-card {
    max-width: 95vw;
    padding: 1.2rem 1rem;
  }
  .testimonial-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 1rem;
  }
}
</style>