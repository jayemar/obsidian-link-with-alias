# Link with alias

![Obsidian Downloads](https://img.shields.io/badge/dynamic/json?logo=obsidian&color=%23483699&label=downloads&query=%24%5B%22link-with-alias%22%5D.downloads&url=https%3A%2F%2Fraw.githubusercontent.com%2Fobsidianmd%2Fobsidian-releases%2Fmaster%2Fcommunity-plugin-stats.json&style=plastic) ![](https://img.shields.io/github/v/release/pvojtechovsky/obsidian-link-with-alias?label=Latest%20Release&style=plastic)

This plugin implements these commands

-   Create link with alias - provides fast creation of link whose display text is added into aliases atribute in front matter of the target note.
-   Create link - provides fast creation of link
-   Toggle link display text - toggles display text (alias) of the just edited link.
-   Unlink - removes link formatting while preserving the display text (or link target if no display text exists).

Both `Create link` commands assures that link display text is kept => isn't replaced by Obsidian link autocompletion.

# Link Format Support

This plugin supports **both wiki links and markdown links**, automatically adapting to your Obsidian settings:

- **Wiki Links**: `[[target|display text]]` - Obsidian's native format
- **Markdown Links**: `[display text](target.md)` - Standard markdown format

The plugin automatically detects which format to use based on your Obsidian setting at **Settings -> Files & Links -> Use [[Wikilinks]]**. When this setting is disabled, the plugin creates markdown-style links instead.

All commands work seamlessly with both formats:
- Creating new links respects your chosen format
- Detecting existing links works for both formats
- Toggling display text handles both formats appropriately
- Unlinking works for both formats

**Note on Toggle Behavior**: Due to format differences, the "Toggle link display text" command behaves slightly differently:
- **Wiki links**: Removes or adds the pipe separator and display text (`[[target|text]]` <-> `[[target]]`)
- **Markdown links**: Changes display text between custom text and the link name (`[custom](target.md)` <-> `[target](target.md)`), since markdown links always require display text

# Use cases

**Note**: The examples below show wiki link format (`[[...]]`). If you have markdown links enabled in Obsidian settings, the plugin will use markdown format (`[...](...)`) instead, with identical functionality.

## Make link on existing text

User selects some text and runs the command "Create link with alias". The command creates a new link with target and display name copied from selected text and opens the link autocompletion popup and ...

A) ... user can just select a value from the autocompletion popup, press Enter and link and alias are created.

![Run command, press Enter, done](use-case1.gif)

B) ... user can edit the link target then select a value from the autocompletion popup, press Enter and link and alias are created. Note that link text is kept.

![Run command, edit link, select in autocompletion, press Enter, done](use-case5.gif)

C) ... user can enter name of new note, let cursor leave the link, then the new note is created automatically with link display text as alias.

![Run command, edit link, leave the link, done](use-case6.gif)

## Add alias for existing link

User puts cursor into existing link and runs command "Create link with alias". The command creates the target document, if it doesn't exist, and adds link display text as alias into front matter of the target note

![Run command in link, done](use-case2.gif)

## Make completely new link

User puts cursor into text and runs command "Create link with alias". It creates link brackets and opens autocompletion popup for entering of link target name. After user types in part of the target name or alias and selects it by enter, the link is created. If there is no display text and user moves back into link and enters one, then system detects it and after cursor leaves the brackets or user closes the window, the link display text is added as alias into front matter of the target note. While this use case is supported, it is usually faster to write text without link first and then **Make link on existing text**.

![Run command, select target, press Enter, move cursor back, write alias, leave the link, done](use-case3.gif)

## Toggle link display text

As long as rename of Note has to keep the text with link to note understandable, it is good idea to keep the link display text in the link. In such case the Note is renamed but link display text stays unchanged. That is wanted behavior in many cases.
But in case you have just list of Notes, where you want to see current note name, then the link display text is not helpful. The "Toggle link display text" command is a fast way how to remove unwanted display text and to keep just plain link.

## Unlink

The "Unlink" command removes link formatting while preserving the visible text. Place your cursor anywhere within a link and run the command to convert:
- `[[target|display text]]` → `display text`
- `[[target]]` → `target`
- `[display text](target.md)` → `display text`

This is useful when you want to keep the text but no longer need the link reference. If no link is found at the cursor position, you'll see a notice message. The command is available in the command palette and can be pinned to your toolbar for quick access.

# Settings

You can configured whether

A) the text which is selected when command is executed is copied as link target name, so the autocompletion can immediatelly offer the similar term

B) or the link target is kept empty so you can immediatelly type in the target note name

# Notes

-   The alias is added into front matter of the target note only when it isn't there yet
-   The aliases are sorted from longest to shortest, so the Obsidian backlinks are detected correctly
-   Markdown link support: The plugin works with both wiki links (`[[target|text]]`) and markdown links (`[text](target.md)`). The format used is determined by your Obsidian settings.
-   The link autocompletion popup is the standard one provided by Obsidian. It sometime replaces the link text automaticaly, but it isn't wanted in this use case. The action "Create link with alias" will keep the link text exactly the same like it was before.

![Run command, press Enter, done](use-case4.gif)

# About me

I am a Software developer and architect with more then 35 years of programming experience. I am highly interested in creation and maintenance of human understandable, up to date, distributed and trustworthy knowledge.

I love lifetime, nature, people, psychology and dancing. I am exited about the Obsidian because it helps me to experiment, prototype and prepare concepts of that knowledge base.

Thank You for Your support which helps me to give more time for Obsidian plugins and that Knowledge base project I am dreaming of.

[![Ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/pavel_knowledge)

[<img src="https://cdn.buymeacoffee.com/buttons/v2/default-green.png" alt="BuyMeACoffee" width="170">](https://www.buymeacoffee.com/pavel.knowledge)
