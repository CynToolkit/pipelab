<script setup>
import { VPTeamMembers } from 'vitepress/theme'

const members = [
  {
    avatar: 'https://www.github.com/Armaldio.png',
    name: 'Armaldio',
    title: 'Creator',
    links: [
      { icon: 'github', link: 'https://github.com/Armaldio' },
      { icon: 'twitter', link: 'https://x.com/armaldio' }
    ]
  },
]
</script>

# Our Team

Say hello to our awesome team.

<VPTeamMembers size="small" :members="members" />