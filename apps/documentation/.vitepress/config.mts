import { defineConfig } from 'vitepress'
import lightbox from "vitepress-plugin-lightbox"

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: "Pipelab Documentation",
  description: "Pipelab Documentation",
  lastUpdated: true,
  markdown: {
    config: (md) => {
      // Use lightbox plugin
      md.use(lightbox, {});
    },
  },
  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    nav: [
      { text: 'Guide', link: '/guide/usage' },
      { text: 'Reference', link: '/reference' },
      // { text: 'Blog', link: '/blog' },
      { text: 'Website', link: 'https://pipelab.app' }
    ],

    sidebar: [
      {
        text: 'Introduction',
        items: [
          { text: 'What is Pipelab?', link: '/guide/what-is-pipelab' },
          { text: 'Getting Started', link: '/guide/getting-started' },
        ]
      },
      {
        text: 'Desktop app',
        items: [
          { text: 'Usage', link: '/guide/usage' },
        ]
      },
      {
        text: 'Integrations',
        items: [
          {
            text: 'Overview',
            link: '/guide/integrations'
          },
          {
            text: 'Game Engines',
            items: [
              { text: 'Godot', link: '/guide/integrations/godot' },
              { text: 'Construct 3', link: '/guide/integrations/construct_3' },
              { text: 'Unity', link: '/guide/integrations/unity' },
              { text: 'GDevelop', link: '/guide/integrations/gdevelop' },
            ]
          },
          {
            text: 'Packaging',
            items: [
              { text: 'Electron', link: '/guide/integrations/electron' },
              { text: 'Tauri', link: '/guide/integrations/tauri' },
              { text: 'Neutralino', link: '/guide/integrations/neutralino' },
            ]
          },
          {
            text: 'Platforms',
            items: [
              { text: 'Steam', link: '/guide/integrations/steam' },
              { text: 'Poki', link: '/guide/integrations/poki' },
              { text: 'Itch.io', link: '/guide/integrations/itch_io' },
              { text: 'Epic Game Store', link: '/guide/integrations/epic_game_store' },
              { text: 'Discord', link: '/guide/integrations/discord' },
            ]
          },
          {
            text: 'File System',
            link: '/guide/integrations/filesystem'
          },
          {
            text: 'System',
            link: '/guide/integrations/system'
          },
          {
            text: 'Other',
            items: [
              { text: 'NVPatch', link: '/guide/integrations/nvpatch' },
            ]
          }
        ]
      },
      {
        text: 'API',
        link: "/api"
      },
      {
        text: 'FAQ',
        link: "/faq"
      },
      {
        text: 'Architecture',
        link: "/architecture"
      },
      {
        text: 'Roadmap',
        link: "/roadmap"
      },
      {
        text: 'Team',
        link: "/team"
      }
    ],

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