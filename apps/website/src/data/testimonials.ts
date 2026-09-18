export interface Testimonial {
  text: string;

  // author
  avatar: string;
  name: string;
  authorLink: string;

  // game
  game?: string;
  gameLink?: string;
}

export const testimonials: Testimonial[] = [
  {
    text: `Pipelab has made it super easy to quickly iterate and spread builds of DeadWire to the rest of the team. After setting it up the one click electron export and upload to steam can't be beaten.`,
    avatar: "/testimonials/shotgun_anaconda.jpg",
    name: "Shotgun Anaconda",
    authorLink: "https://x.com/shotgunanaconda",
    game: "DeadWire",
    gameLink: "https://store.steampowered.com/app/2995100/DeadWire/",
  },
  {
    text: `Pipelab is an exceptional tool for indie developers, offering a rich set of features that streamline game development workflows. It's especially invaluable for games made with Construct 3, providing the most efficient and reliable solution for exporting games to Steam. The level of support is outstanding—responsive, helpful, and genuinely invested in your success.`,
    avatar: "/testimonials/overboy.png",
    name: "overboy",
    authorLink: "https://x.com/OverboyYT",
    game: "Noobs Are Coming",
    gameLink: "https://store.steampowered.com/app/2225960/Noobs_Are_Coming/",
  },
  {
    text: `Pipelab is amazing. If you're a serious game developer, it has everything you need to automate your deploying process into multiple platforms, and it's all seamless.`,
    avatar: "/testimonials/asteristic_game_studio.jpg",
    name: "Asteristic Game Studio",
    authorLink: "https://asteristic.com/",
  },
  {
    text: `We have used Pipelab on a variety of projects and it continues to exceed our expectations! Pipelab is an invaluable automation tool that eliminates the errors of a manual build process by building packages based on clearly defined rules. If you need a consistent way to support a large number of games across different platforms, Pipelab is by far the best solution available.`,
    avatar: "/testimonials/ideaspersecond.jpg",
    name: "Ideas Per Second",
    authorLink: "https://www.ideaspersecond.com/",
    gameLink: "https://store.steampowered.com/app/4241690/Hydra_Heli_2",
  },
];
