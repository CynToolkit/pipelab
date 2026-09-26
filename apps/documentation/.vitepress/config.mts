import { defineConfig } from 'vitepress'
import lightbox from "vitepress-plugin-lightbox"

export default defineConfig({
  title: "Pipelab Documentation",
  description: "Guides and references for Pipelab",
  lastUpdated: true,
  markdown: {
    config: (md) => {
      md.use(lightbox, {});
    },
  },
  themeConfig: {
    nav: [
      { text: 'User guide', link: '/guide/what-is-pipelab' },
      { text: 'CLI', link: '/cli/installation' },
      { text: 'Contributing', link: '/contributing/development' },
      { text: 'Website', link: 'https://pipelab.app' },
    ],

    sidebar: {
      '/guide/': [
        {
          text: 'Get started',
          items: [
            { text: 'What is Pipelab?', link: '/guide/what-is-pipelab' },
            { text: 'Install and start', link: '/guide/installation' },
            { text: 'First project and pipeline', link: '/guide/getting-started' },
          ],
        },
        {
          text: 'Build and run',
          items: [
            { text: 'Edit and run a pipeline', link: '/guide/pipelines' },
            { text: 'Release workflows', link: '/guide/release-workflows' },
            { text: 'Workflow inputs and dependencies', link: '/guide/workflow-references' },
            { text: 'Runs and history', link: '/guide/runs-and-history' },
          ],
        },
        {
          text: 'Providers and tasks',
          items: [
            { text: 'Catalog', link: '/guide/integrations/' },
            { text: 'Folder and ZIP', link: '/guide/integrations/folder-zip' },
            { text: 'Construct 3', link: '/guide/integrations/construct' },
            { text: 'Godot', link: '/guide/integrations/godot' },
            { text: 'Electron', link: '/guide/integrations/electron' },
            { text: 'Tauri', link: '/guide/integrations/tauri' },
            { text: 'Discord Activity', link: '/guide/integrations/discord-activity' },
            { text: 'Filesystem', link: '/guide/integrations/filesystem' },
            { text: 'System actions', link: '/guide/integrations/system' },
            { text: 'Minify', link: '/guide/integrations/minify' },
            { text: 'Netlify', link: '/guide/integrations/netlify' },
            { text: 'NVPatch', link: '/guide/integrations/nvpatch' },
            { text: 'Publishing overview', link: '/guide/publishing/' },
            { text: 'Steam', link: '/guide/publishing/steam' },
            { text: 'itch.io', link: '/guide/publishing/itch' },
            { text: 'Poki', link: '/guide/publishing/poki' },
          ],
        },
        {
          text: 'Account and help',
          items: [
            { text: 'Settings, account, updates', link: '/guide/settings-account-updates' },
            { text: 'Pipelab Cloud artifacts', link: '/guide/cloud-artifacts' },
            { text: 'Architecture overview', link: '/guide/architecture' },
            { text: 'Troubleshooting', link: '/guide/troubleshooting' },
          ],
        },
      ],
      '/cli/': [
        {
          text: 'Command-line interface',
          items: [
            { text: 'Install and configure', link: '/cli/installation' },
            { text: 'Command reference', link: '/cli/reference' },
          ],
        },
      ],
      '/reference/': [
        {
          text: 'Technical reference',
          items: [
            { text: 'Workflow runtime format', link: '/reference/workflow-runtime' },
          ],
        },
      ],
      '/contributing/': [
        {
          text: 'Contributing',
          items: [
            { text: 'Development setup', link: '/contributing/development' },
            { text: 'Architecture and packages', link: '/contributing/architecture' },
            { text: 'Release process', link: '/contributing/releases' },
          ],
        },
      ],
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/CynToolkit/pipelab' },
      { icon: 'discord', link: 'https://discord.gg/MzNw26cBb5' },
      { icon: 'x', link: 'https://x.com/pipelabapp' },
      { icon: 'mastodon', link: 'https://mastodon.gamedev.place/@pipelab' },
      { icon: 'bluesky', link: 'https://bsky.app/profile/pipelab.bsky.social' },
    ],

    editLink: {
      pattern: 'https://github.com/CynToolkit/pipelab/edit/develop/apps/documentation/:path'
    },

    search: {
      provider: 'local'
    },

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2024-present Armaldio'
    }
  },
})
