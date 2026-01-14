import { App, Editor, EditorPosition, MarkdownFileInfo, MarkdownView, Notice, Plugin, PluginManifest, ReferenceCache, TFile } from "obsidian";

import { EditorCursorListener } from "./EditorCursorListener";
import { addMissingAliasesIntoFile } from "./InjectAlias";
import { Unregister } from "./ListenerRegistry";
import { MarkdownLinkSuggest } from "./MarkdownLinkSuggest";
import { getReferenceCacheFromEditor, removeLinkFormatting, setLinkText } from "./MarkdownUtils";
import { equalsPosition, isEditorPositionInPos, moveCursor, moveEditorPosition } from "./PositionUtils";
import { DEFAULT_SETTINGS, LinksSettingTab } from "./settings";
import { getTemplaterPlugin } from "./TemplaterIntegration";
import { capitalize, isNewFile } from "./Utils";
import { getOrCreateFileOfLink } from "./VaultUtils";

interface CanvasNode {
	canvas: unknown;
}

function isCanvasNode(obj: unknown): obj is CanvasNode {
	if (typeof obj == "object" && obj != null && "canvas" in obj) {
		return true;
	}
	return false;
}

interface CanvasNodeContext {
	node: CanvasNode;
}

function isCanvasNodeContext(ctx: unknown): ctx is CanvasNodeContext {
	if (typeof ctx == "object" && ctx != null && "node" in ctx) {
		return isCanvasNode((ctx as CanvasNodeContext).node);
	}
	return false;
}

/**
 * Information about to be handled link
 */
class LinkInfo {
	/**  */
	private readonly unregister: Unregister[] = [];

	constructor(
		/** Editor position of the link start bracket `[` */
		public readonly linkStart: EditorPosition,
		/** The file which contains the link */
		public readonly file: TFile | undefined,
		/** The Editor which contains the link*/
		public readonly editor: Editor,
		/** At the end make alias */
		public readonly makeAlias: boolean,
		/** The latest version of link cache */
		public cacheLink: ReferenceCache,
		/** The string of link text from the last process check */
		public linkText?: string,
	) {}

	register(unregister: Unregister): this {
		this.unregister.push(unregister);
		return this;
	}

	destroy() {
		this.unregister.forEach((c) => c());
		this.unregister.length = 0;
	}
}

/**
 * Main plugin class
 */
export default class LinkWithAliasPlugin extends Plugin {
	editorCursorListener: EditorCursorListener;
	linkInfo?: LinkInfo;
	settings = DEFAULT_SETTINGS;
	markdownLinkSuggest?: MarkdownLinkSuggest;

	constructor(app: App, manifest: PluginManifest) {
		super(app, manifest);
		this.editorCursorListener = new EditorCursorListener(this);
	}

	async onload() {
		await this.loadSettings();

		this.addCommand({
			id: "create-link-with-alias",
			name: "Create link with alias",
			icon: "bracket-glyph",
			editorCallback: (editor: Editor, ctx) => {
				this.createLinkFromSelection(this.getFileFromContext(ctx), editor, editor.getCursor(), {
					makeAlias: true,
					pathFromText: this.settings.copyDisplayText,
				});
			},
		});
		this.addCommand({
			id: "create-link",
			name: "Create link",
			icon: "bracket-glyph",
			editorCallback: (editor: Editor, ctx) => {
				this.createLinkFromSelection(this.getFileFromContext(ctx), editor, editor.getCursor(), {
					makeAlias: false,
					pathFromText: this.settings.copyDisplayText,
				});
			},
		});

		this.addCommand({
			id: "toggle-link-display-text",
			name: "Toggle link display text",
			icon: "link-2",
			editorCallback: (editor: Editor, ctx) => {
				this.toggleLinkTextFromSelection(this.getFileFromContext(ctx), editor, editor.getCursor());
			},
		});

		this.addCommand({
			id: "unlink",
			name: "Unlink",
			icon: "unlink",
			editorCallback: (editor: Editor, ctx) => {
				this.unlinkAtCursor(this.getFileFromContext(ctx), editor, editor.getCursor());
			},
		});

		// Register markdown link autocomplete suggester
		this.markdownLinkSuggest = new MarkdownLinkSuggest(this.app);
		this.registerEditorSuggest(this.markdownLinkSuggest);

		this.addSettingTab(new LinksSettingTab(this.app, this));
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	private useMarkdownLinks(): boolean {
		// Use private API to detect user preference for link format
		// This is widely used by other plugins and stable
		return (this.app.vault as any).getConfig("useMarkdownLinks") === true;
	}

	private getFileFromContext(ctx: MarkdownView | MarkdownFileInfo): TFile | undefined {
		if (ctx.file) {
			return ctx.file;
		}
		if (isCanvasNodeContext(ctx)) {
			//TODO detect file of the canvas
		}
		return;
	}

	/**
	 * starts create link with alias process for current `editor` of `file` on `position`
	 * Only one link is processed, so only last call matters
	 * @param file
	 * @param editor
	 * @param position
	 */
	private createLinkFromSelection(
		file: TFile | undefined,
		editor: Editor,
		position: EditorPosition,
		options: { makeAlias: boolean; pathFromText: boolean },
	): void {
		/**
		 * returns ReferenceCache like structure which describes the link in `editor` on `pos` position or undefined if there is no link at `pos` position
		 */
		const cacheLink = getReferenceCacheFromEditor(editor, position);
		if (cacheLink != null && cacheLink.position.start.col !== position.ch) {
			//the cursor is inside the link, do not make nested link
			//but instead check that display text is used as alias
			if (options.makeAlias) {
				this.addMissingAlias(cacheLink, file?.path);
			}
			return;
		}
		const selected_word = editor.getSelection();
		const useMarkdown = this.useMarkdownLinks();
		let linkStart;
		let linkText;
		if (selected_word == "") {
			//nothing is selected, just create a new empty link
			if (useMarkdown) {
				editor.replaceSelection(`[]()`);
				linkStart = moveEditorPosition(moveCursor(editor, -1), -2);
			} else {
				editor.replaceSelection(`[[]]`);
				linkStart = moveEditorPosition(moveCursor(editor, -2), -2);
			}
		} else if (selected_word.indexOf("|") >= 0) {
			const parts = selected_word.split("|");
			if (parts.length > 2) {
				return;
			}
			//selected text already contains a file name and display text
			if (useMarkdown) {
				// Markdown: [text](file.md)
				const targetFile = this.app.metadataCache.getFirstLinkpathDest(parts[0], file?.path ?? '');
				let linkPath: string;
				if (targetFile) {
					// Use generateMarkdownLink to get properly encoded link
					const fullLink = this.app.fileManager.generateMarkdownLink(targetFile, file?.path ?? '', undefined, parts[1]);
					editor.replaceSelection(fullLink);
					// Extract link path length from generated link for cursor positioning
					const pathMatch = fullLink.match(/\]\(([^)]*)\)/);
					linkPath = pathMatch ? pathMatch[1] : parts[0] + '.md';
				} else {
					// File doesn't exist yet - encode path manually
					linkPath = encodeURIComponent(parts[0]).replace(/%2F/g, '/') + '.md';
					editor.replaceSelection(`[${parts[1]}](${linkPath})`);
				}
				linkStart = moveEditorPosition(moveCursor(editor, -(linkPath.length + 1)), -1);
				linkText = parts[1];
			} else {
				// Wiki: [[file|text]]
				editor.replaceSelection(`[[${selected_word}]]`);
				linkStart = moveEditorPosition(moveCursor(editor, -(parts[1].length + 3)), -(parts[0].length + 2));
				linkText = parts[1];
			}
		} else {
			//text is selected
			if (options.pathFromText) {
				// use it as link target and also link display text
				if (useMarkdown) {
					// Markdown: [text]() - empty link path initially
					editor.replaceSelection(`[${selected_word}]()`);
					linkStart = moveEditorPosition(moveCursor(editor, -1), -(selected_word.length + 3));
					linkText = selected_word;
				} else {
					// Wiki: [[Text|text]]
					editor.replaceSelection(`[[${this.capitalizeOptionally(selected_word)}|${selected_word}]]`);
					linkStart = moveEditorPosition(moveCursor(editor, -(selected_word.length + 3)), -(selected_word.length + 2));
					linkText = selected_word;
				}
			} else {
				// use it as link display text
				if (useMarkdown) {
					// Markdown: [text]() - empty link path, user will fill it
					editor.replaceSelection(`[${selected_word}]()`);
					linkStart = moveEditorPosition(moveCursor(editor, -1), -(selected_word.length + 3));
					linkText = selected_word;
				} else {
					// Wiki: [[|text]]
					editor.replaceSelection(`[[|${selected_word}]]`);
					linkStart = moveEditorPosition(moveCursor(editor, -(selected_word.length + 3)), -2);
					linkText = selected_word;
				}
			}
		}

		if (this.linkInfo) {
			//destroy old link handling request
			this.linkInfo.destroy();
			delete this.linkInfo;
		}
		const newCacheLink = getReferenceCacheFromEditor(editor, position);
		if (!newCacheLink) throw new Error("cannot find newly create link");
		//create new link handling request
		const lastLink = new LinkInfo(linkStart, file, editor, options.makeAlias, newCacheLink, linkText);

		lastLink.register(
			//listen on cursor move or deactivation of editor
			this.editorCursorListener.fireOnCursorChange(editor, (cursorPosition) => {
				if (!cursorPosition) {
					//user is editing another file now. Add missing alias from origin file
					if (lastLink.makeAlias) {
						this.addMissingAlias(lastLink.cacheLink, lastLink.file?.path);
					}
					return false;
				}
				return this.handleChangeOnLastLink(editor, lastLink);
			}),
		);

		this.linkInfo = lastLink;
	}

	capitalizeOptionally(name: string): string {
		if (this.settings.capitalizeFileName) {
			return capitalize(name);
		}
		return name;
	}

	toggleLinkTextFromSelection(file: TFile | undefined, editor: Editor, position: EditorPosition): void {
		const cacheLink = getReferenceCacheFromEditor(editor, position);
		if (cacheLink != null && cacheLink.position.start.col !== position.ch) {
			//the cursor is inside the link, toggle display text
			const isMarkdown = cacheLink.original.startsWith('[');

			if (cacheLink.displayText == null) {
				//add display text
				if (isMarkdown) {
					// For markdown, set display text to link name
					setLinkText(cacheLink, editor, cacheLink.link);
				} else {
					// For wiki, add pipe separator to open dropdown
					editor.setCursor({ line: cacheLink.position.end.line, ch: cacheLink.position.end.col - 2 });
					editor.replaceSelection("|");
				}
			} else {
				// delete display text from this link
				if (isMarkdown) {
					// For markdown, set display text to link name (same behavior as wiki)
					setLinkText(cacheLink, editor, cacheLink.link);
				} else {
					// For wiki, delete display text and keep just plain link
					setLinkText(cacheLink, editor, undefined);
				}
			}
			return;
		}
	}

	private unlinkAtCursor(file: TFile | undefined, editor: Editor, position: EditorPosition): void {
		const cacheLink = getReferenceCacheFromEditor(editor, position);

		if (cacheLink == null) {
			// No link found at cursor position
			new Notice("No link found at cursor position");
			return;
		}

		// Remove the link formatting, keeping the display text or link name
		const preservedText = removeLinkFormatting(cacheLink, editor);

		// Position cursor at the start of the preserved text
		editor.setCursor({
			line: cacheLink.position.start.line,
			ch: cacheLink.position.start.col
		});
	}

	/**
	 * Handles cache or editor cursor position change on the lastLink
	 * @param editor
	 * @param lastLink
	 * @returns false if we are finished with that link
	 */
	private handleChangeOnLastLink(editor: Editor, lastLink: LinkInfo): boolean {
		const cacheLink = getReferenceCacheFromEditor(editor, lastLink.linkStart);
		if (cacheLink && equalsPosition(lastLink.linkStart, cacheLink.position.start)) {
			//the link still exist and starts on the expected position, continue handling
			lastLink.cacheLink = cacheLink;
			//the cache link for just created link exists now
			if (isEditorPositionInPos(lastLink.editor.getCursor(), cacheLink.position)) {
				//User still edits the last link,
				//update the link text if it was changed by user
				lastLink.linkText = cacheLink.displayText;
				//wait until he is done and moves cursor out
				return true;
			}
			//user left the link so s/he is done
			if (lastLink.linkText) {
				//Reset the link text in case the obsidian autocompletion changed it
				setLinkText(cacheLink, editor, lastLink.linkText);
			}
			if (lastLink.makeAlias) {
				//now we can create an alias
				this.addMissingAlias(cacheLink, lastLink.file?.path);
			}
			//continue handling here, because user can come back and add different alias for that last link
			return true;
		}
		//the link doesn't exist or start of the link was moved, do not handle it
		//unregister all handlers for this link, not just this one callback
		lastLink.destroy();
		//and do not call this callback anynmore
		return false;
	}

	/**
	 * creates target file and alias if something is not existing
	 * @param cacheLink
	 * @param sourcePath
	 * @returns
	 */
	private async addMissingAlias(cacheLink: ReferenceCache, sourcePath: string | undefined): Promise<void> {
		if (!cacheLink.original.contains("|") || !cacheLink.displayText) {
			//there is no special display text = no alias to add
			return;
		}
		//the link contains display text. Add it as alias
		const linkTargetPath = cacheLink.link;
		if (!linkTargetPath) {
			//there is no link target
			return;
		}
		const target = await getOrCreateFileOfLink(this.app, linkTargetPath, sourcePath);
		if (isNewFile(target)) {
			const templaterPlugin = getTemplaterPlugin(this.app);
			if (templaterPlugin) {
				await templaterPlugin.waitUntilDone();
			}
		}
		await addMissingAliasesIntoFile(this.app.fileManager, target, [cacheLink.displayText]);
	}
}
