---
category: integrations
---

# Construct 3

## Features
- Automatic project export to html
- [Electron](/guide/integrations/electron.md) Integration

There are two tasks available for Construct 3:

- **.c3p export**: Export a single Construct 3 project to html
- **folder export**: Export a Construct 3 project folder to html

Under the hood, Pipelab launches a local browser instance to export the project to HTML.
You must enter your username and password to avoid being restricted by Construct 3's limits.
Additionally, you must specify the path to your browser's data to reuse your installed Construct 3 plugins.

## Integration with the Construct editor
Pipelab integrate within [Construct 3](https://editor.construct.net/) by using a plugin. You can download it [from Github](https://github.com/CynToolkit/construct-plugin/releases) or [from the Construct website](https://www.construct.net/en/make-games/addons/1415/pipelab).
Once downloaded:
- [Install the plugin](https://www.construct.net/en/make-games/manuals/construct-3/tips-and-guides/installing-third-party-addons)
- Add it to your project by double clicking an empty space
<img src="https://github.com/user-attachments/assets/444e3a21-164a-4f8c-b4cc-dcb6f61192d9" height="450">

- Go to your first event sheet, and initialize the addon
  
![image](https://github.com/user-attachments/assets/9dd4f8fe-5c43-43cd-9f1b-a000fa889f08)
