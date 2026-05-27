<script setup lang="ts">
import { ref, nextTick } from 'vue';
import confetti from 'canvas-confetti';

// App Phases
type Phase = 'setup' | 'building' | 'success' | 'error';

const phase = ref<Phase>('setup');
const appName = ref('My Construct 3 Game');
const appVersion = ref('1.0.0');
const platform = ref<'win32' | 'linux'>('win32');
const file = ref<File | null>(null);

// Loading Progress States
const progress = ref(0);
const activeStep = ref(0);
const errorMessage = ref('');
const downloadUrl = ref('');
const activeAbortController = ref<AbortController | null>(null);

// Steps list
const steps = [
  'Reading Construct 3 ZIP archive...',
  'Uploading bundle to compilation server...',
  'Downloading base Electron binary framework...',
  'Injecting assets and custom app configurations...',
  'Finalizing executable structure and compression...',
  'Ready to download!'
];

const fileInput = ref<HTMLInputElement | null>(null);

const triggerFileSelect = () => {
  fileInput.value?.click();
};

// Drag & Drop visual state
const dragActive = ref(false);

const handleDragEnter = (e: DragEvent) => {
  e.preventDefault();
  dragActive.value = true;
};

const handleDragOver = (e: DragEvent) => {
  e.preventDefault();
  dragActive.value = true;
};

const handleDragLeave = (e: DragEvent) => {
  e.preventDefault();
  dragActive.value = false;
};

const handleDrop = (e: DragEvent) => {
  e.preventDefault();
  dragActive.value = false;
  
  if (e.dataTransfer && e.dataTransfer.files.length > 0) {
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile.name.endsWith('.zip')) {
      file.value = droppedFile;
    } else {
      alert('Please upload a ZIP file of your Construct 3 HTML5 export.');
    }
  }
};

const handleFileSelect = (e: Event) => {
  const target = e.target as HTMLInputElement;
  if (target.files && target.files.length > 0) {
    file.value = target.files[0];
  }
};

const removeFile = () => {
  file.value = null;
};

const triggerConfetti = () => {
  // Fire multiple bursts of confetti
  const duration = 2.5 * 1000;
  const animationEnd = Date.now() + duration;
  const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 9999 };

  const randomInRange = (min: number, max: number) => {
    return Math.random() * (max - min) + min;
  };

  const interval: any = setInterval(() => {
    const timeLeft = animationEnd - Date.now();

    if (timeLeft <= 0) {
      return clearInterval(interval);
    }

    const particleCount = 50 * (timeLeft / duration);
    // since particles fall down, animate a bit higher than random
    confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } });
    confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } });
  }, 250);
};

const startPackaging = async () => {
  if (!file.value) return;
  
  phase.value = 'building';
  errorMessage.value = '';
  downloadUrl.value = '';
  activeStep.value = 0;
  progress.value = 0;
  
  const controller = new AbortController();
  activeAbortController.value = controller;
  
  // Simulated progress loop for user engagement (pauses at 90% until fetch finishes)
  let simulatedProgress = 0;
  const progressInterval = setInterval(() => {
    if (simulatedProgress < 90) {
      // Accelerate initially, decelerate later
      let increment = 1;
      if (simulatedProgress < 30) increment = 2;
      else if (simulatedProgress > 75) increment = 0.5;
      
      simulatedProgress = Math.min(90, simulatedProgress + increment);
      progress.value = Math.floor(simulatedProgress);
      
      // Update step focus based on percentage
      if (progress.value < 15) {
        activeStep.value = 0;
      } else if (progress.value < 35) {
        activeStep.value = 1;
      } else if (progress.value < 60) {
        activeStep.value = 2;
      } else if (progress.value < 75) {
        activeStep.value = 3;
      } else {
        activeStep.value = 4;
      }
    }
  }, 120);

  try {
    const formData = new FormData();
    formData.append("file", file.value);
    formData.append("name", appName.value || "Construct3Game");
    formData.append("version", appVersion.value || "1.0.0");
    formData.append("platform", platform.value);
    
    // Read local supabase configuration or fallback to production
    const baseUrl = import.meta.env.VITE_SUPABASE_URL || "https://uehmyyeqheqnxmzhctcd.supabase.co";
    const functionUrl = `${baseUrl}/functions/v1/c3-export`;
    
    const response = await fetch(functionUrl, {
      method: "POST",
      body: formData,
      signal: controller.signal
    });
    
    clearInterval(progressInterval);
    
    if (!response.ok) {
      let errText = "Failed to bundle application on the compilation server.";
      try {
        const errJson = await response.json();
        if (errJson && errJson.error) {
          errText = errJson.error;
        }
      } catch {
        const text = await response.text();
        if (text) errText = text;
      }
      throw new Error(errText);
    }
    
    // Jump progress to completion
    activeStep.value = 5;
    progress.value = 100;
    
    const blob = await response.blob();
    downloadUrl.value = URL.createObjectURL(blob);
    phase.value = 'success';
    
    // Fire confetti on the next cycle
    nextTick(() => {
      triggerConfetti();
    });
    
  } catch (error: any) {
    clearInterval(progressInterval);
    if (error.name === 'AbortError') {
      phase.value = 'setup';
    } else {
      console.error(error);
      errorMessage.value = error.message || "An unexpected error occurred during execution.";
      phase.value = 'error';
    }
  } finally {
    activeAbortController.value = null;
  }
};

const cancelBuild = () => {
  if (activeAbortController.value) {
    activeAbortController.value.abort();
  }
};

const resetForm = () => {
  phase.value = 'setup';
  file.value = null;
  downloadUrl.value = '';
  errorMessage.value = '';
};

const formatSize = (bytes: number) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};
</script>

<template>
  <div class="glass-container">
    <!-- Header -->
    <header class="app-header">
      <div class="logo-container">
        <!-- Custom SVG Pipelab Logo representing workflow pipes -->
        <svg class="logo-icon" viewBox="0 0 24 24">
          <path d="M19 9h-2V7a3 3 0 00-3-3H5a3 3 0 00-3 3v10a3 3 0 003 3h9a3 3 0 003-3v-2h2a3 3 0 003-3V12a3 3 0 00-3-3zM5 6h9a1 1 0 011 1v2H5a1 1 0 01-1-1V7c0-.55.45-1 1-1zm9 12H5a1 1 0 01-1-1v-2h11v2c0 .55-.45 1-1 1zm5-5h-2v-2h2a1 1 0 011 1v0c0 .55-.45 1-1 1z" />
        </svg>
      </div>
      <h1 class="app-title">C3 Electron Exporter</h1>
      <p class="app-subtitle">Instantly package your Construct 3 HTML5 exports into desktop programs</p>
      <span class="badge">Web Packager</span>
    </header>

    <!-- Phase 1: Setup Form -->
    <main v-if="phase === 'setup'">
      <!-- Dropzone -->
      <div 
        v-if="!file" 
        class="dropzone"
        :class="{ 'drag-active': dragActive }"
        @dragenter="handleDragEnter"
        @dragover="handleDragOver"
        @dragleave="handleDragLeave"
        @drop="handleDrop"
        @click="triggerFileSelect"
      >
        <input 
          type="file" 
          ref="fileInput" 
          accept=".zip" 
          style="display: none;" 
          @change="handleFileSelect" 
        />
        <svg class="dropzone-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
        </svg>
        <p class="dropzone-text">Drag & drop export ZIP file</p>
        <p class="dropzone-hint">or click to browse local files (Construct 3 HTML5 Export)</p>
      </div>

      <!-- File Selected Feedback -->
      <div v-else class="file-selected-box">
        <div class="file-info">
          <svg class="file-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <div>
            <div class="file-name">{{ file.name }}</div>
            <div class="file-size">{{ formatSize(file.size) }}</div>
          </div>
        </div>
        <button class="remove-file-btn" @click="removeFile" title="Remove file">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <!-- Form Settings -->
      <div class="form-group">
        <label class="form-label">Application Name</label>
        <input 
          type="text" 
          class="form-input" 
          v-model="appName" 
          placeholder="e.g. My Awesome C3 Game" 
        />
      </div>

      <div class="form-group">
        <label class="form-label">Application Version</label>
        <input 
          type="text" 
          class="form-input" 
          v-model="appVersion" 
          placeholder="e.g. 1.0.0" 
        />
      </div>

      <div class="form-group">
        <label class="form-label">Target Platform</label>
        <div class="platform-tabs">
          <button 
            type="button" 
            class="platform-tab" 
            :class="{ active: platform === 'win32' }" 
            @click="platform = 'win32'"
          >
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M0 3.449L9.75 2.1v9.45H0V3.449zM0 12.45h9.75v9.45L0 20.551v-8.101zM10.8 1.95L24 0v11.55H10.8V1.95zM10.8 12.45H24v11.55l-13.2-1.95V12.45z" />
            </svg>
            Windows (x64)
          </button>
          <button 
            type="button" 
            class="platform-tab" 
            :class="{ active: platform === 'linux' }" 
            @click="platform = 'linux'"
          >
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2c-.63 0-1.25.13-1.81.38C8.5 3.1 7.2 4.93 6.88 7.03c-.15 1-.05 2.05.28 3 .12.35.3.69.51 1-.41 1-.72 2.08-.94 3.17-.4 1.96-.34 4 .19 5.92.17.63.48 1.22.9 1.72.63.75 1.54 1.16 2.5 1.16h4.36c.96 0 1.87-.41 2.5-1.16.42-.5.73-1.09.9-1.72.53-1.92.59-3.96.19-5.92-.22-1.09-.53-2.17-.94-3.17.21-.31.39-.65.51-1 .33-.95.43-2 .28-3-.32-2.1-1.62-3.93-3.31-4.65C13.25 2.13 12.63 2 12 2zm-2.5 7.5a1.25 1.25 0 1 1 2.5 0 1.25 1.25 0 0 1-2.5 0zm5 0a1.25 1.25 0 1 1 2.5 0 1.25 1.25 0 0 1-2.5 0zM12 14c1.1 0 2 .9 2 2s-.9 2-2 2-2-.9-2-2 .9-2 2-2z"/>
            </svg>
            Linux (x64)
          </button>
        </div>
      </div>

      <button 
        class="btn-primary" 
        :disabled="!file" 
        @click="startPackaging"
      >
        <span>Build Electron Desktop App</span>
      </button>
    </main>

    <!-- Phase 2: Building Loader -->
    <main v-else-if="phase === 'building'" class="loader-layout">
      <h2 class="loader-title">Packaging Game Executable...</h2>
      
      <!-- Circular Progress Loader -->
      <div class="spinner-container">
        <div class="spinner-outer"></div>
        <div class="spinner-inner-pct">{{ progress }}%</div>
      </div>

      <!-- Linear Progress Bar -->
      <div class="progress-container">
        <div class="progress-bar" :style="{ width: progress + '%' }"></div>
      </div>

      <!-- Active compilation steps -->
      <div class="steps-list">
        <div 
          v-for="(step, idx) in steps" 
          :key="idx" 
          class="step-item"
          :class="{ 
            'active': activeStep === idx,
            'completed': activeStep > idx
          }"
        >
          <div class="step-icon-wrapper">
            <span v-if="activeStep > idx">✓</span>
            <span v-else>{{ idx + 1 }}</span>
          </div>
          <div class="step-label">{{ step }}</div>
        </div>
      </div>

      <button class="btn-secondary" @click="cancelBuild">
        Cancel Build
      </button>
    </main>

    <!-- Phase 3: Success View -->
    <main v-else-if="phase === 'success'" class="success-layout">
      <div class="success-icon-container">
        <svg class="success-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7" />
        </svg>
      </div>
      
      <h2 class="success-title">Repackaging Complete!</h2>
      <p class="success-desc">
        Your Construct 3 export was successfully injected into the Electron template wrapper for {{ platform === 'win32' ? 'Windows' : 'Linux' }}.
      </p>

      <a :href="downloadUrl" :download="`${appName.toLowerCase().replace(/[^a-z0-9-]/g, '-')}-electron.zip`" class="btn-primary" style="text-decoration: none;">
        <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
        Download Electron Application (.zip)
      </a>

      <button class="btn-secondary" @click="resetForm">
        Build Another Export
      </button>

      <!-- Pipelab Desktop Nudge -->
      <section class="nudge-card">
        <h3 class="nudge-title">💡 Build native desktop apps with Pipelab</h3>
        <p class="nudge-subtitle">
          Enjoy advanced publishing options, proper installers, code-signing, and seamless pipeline workflows with our desktop app.
        </p>

        <table class="nudge-features-table">
          <thead>
            <tr>
              <th>Feature</th>
              <th>C3 Web Exporter</th>
              <th>Pipelab Desktop App</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="feature-col">Target Platform Support</td>
              <td class="web-col">Windows & Linux</td>
              <td class="native-col">Windows, macOS & Linux</td>
            </tr>
            <tr>
              <td class="feature-col">Code Signing & Notarization</td>
              <td class="web-col">✗ None</td>
              <td class="native-col">✓ Integrated (Avoid SmartScreen)</td>
            </tr>
            <tr>
              <td class="feature-col">Automated Releases</td>
              <td class="web-col">✗ Manual download</td>
              <td class="native-col">✓ Steam & Itch.io automatic publish</td>
            </tr>
            <tr>
              <td class="feature-col">Asset Compression & Minifying</td>
              <td class="web-col">✗ No changes</td>
              <td class="native-col">✓ Automatic (reduce app sizes by 40%)</td>
            </tr>
            <tr>
              <td class="feature-col">Workflow Automation Nodes</td>
              <td class="web-col">✗ Packaging only</td>
              <td class="native-col">✓ Filesystem, Discord, Netlify, Custom scripts</td>
            </tr>
          </tbody>
        </table>

        <div class="nudge-cta-box">
          <p class="nudge-cta-text">
            Pipelab is a visual node editor that handles compiling, code signing, and distributing games. Bring your pipeline automations to the next level.
          </p>
          <a href="https://pipelab.dev" target="_blank" class="nudge-btn">
            Get Pipelab Desktop App (Free)
            <!-- Link Arrow icon -->
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </a>
        </div>
      </section>
    </main>

    <!-- Phase 4: Error View -->
    <main v-else-if="phase === 'error'" class="error-layout">
      <div class="error-icon-container">
        <svg class="error-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      </div>

      <h2 class="error-title">Packaging Failed</h2>
      <div class="error-message">
        {{ errorMessage }}
      </div>

      <button class="btn-primary" @click="phase = 'setup'">
        Try Again
      </button>
      <button class="btn-secondary" @click="resetForm">
        Reset Exporter
      </button>
    </main>
  </div>
</template>

<style scoped>
/* Scoped overrides/adjustments */
</style>
