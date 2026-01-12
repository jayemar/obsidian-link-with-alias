import { Editor, EditorPosition, Pos, ReferenceCache } from "obsidian";
import { locToEditorPositon, moveLoc } from "./PositionUtils";

const linkPrefix = "[[";
const linkSuffix = "]]";
const displaTextSeparator = "|";
const mdLinkPattern = /\[([^\]]*)\]\(([^)]*)\)/;

/**
 * @param editor
 * @param pos
 * @returns ReferenceCache like structure which describes the link in `editor` on `pos` position or undefined if there is no link at `pos` position
 */
export function getReferenceCacheFromEditor(editor: Editor, pos?: EditorPosition): ReferenceCache | undefined {
	if (!pos) pos = editor.getCursor();
	const line = editor.getLine(pos.line);

	// Try wiki link detection first (preserve existing behavior)
	const wikiLink = detectWikiLink(line, pos);
	if (wikiLink) return wikiLink;

	// Try markdown link detection
	return detectMarkdownLink(line, pos);
}

function detectWikiLink(line: string, pos: EditorPosition): ReferenceCache | undefined {
	let posOffset = pos.ch;
	if (line.substring(posOffset, posOffset + 2) == linkPrefix) {
		//cursor is at the beginning of link
		posOffset += 2;
	}
	//search for closing ]]
	if (line.charAt(posOffset) == "]") {
		posOffset--;
	}
	let lastLookup: string | undefined;
	let endIdx = firstIndexOf(line, posOffset, (lookup) => {
		lastLookup = lookup(2);
		return lastLookup == linkSuffix || lastLookup == linkPrefix;
	});
	if (endIdx < 0 || lastLookup != linkSuffix) {
		return;
	}
	endIdx += linkSuffix.length;
	//search for openning [[
	let lastLookup2: string | undefined;
	const startIdx = lastIndexOf(line, posOffset, (lookup) => {
		lastLookup2 = lookup(2);
		return lastLookup2 == linkSuffix || lastLookup2 == linkPrefix;
	});
	if (startIdx < 0 || lastLookup2 != linkPrefix) {
		return;
	}
	const original = line.substring(startIdx, endIdx);
	const parts = original.substring(2, original.length - 2).split(displaTextSeparator);
	return {
		link: parts[0],
		position: {
			start: {
				col: startIdx,
				line: pos.line,
				offset: -1,
			},
			end: {
				col: endIdx,
				line: pos.line,
				offset: -1,
			},
		},
		original,
		//keep displayText undefined in case the link contains no display text, just link name
		displayText: parts[1],
	};
}

function detectMarkdownLink(line: string, pos: EditorPosition): ReferenceCache | undefined {
	// Find markdown link pattern around cursor position
	let startIdx = pos.ch;

	// Search backwards for '['
	while (startIdx > 0 && line.charAt(startIdx) !== '[') {
		startIdx--;
	}
	if (startIdx < 0 || line.charAt(startIdx) !== '[') return undefined;

	// Search forwards for complete pattern [text](url)
	const remainingLine = line.substring(startIdx);
	const match = remainingLine.match(mdLinkPattern);
	if (!match) return undefined;

	const endIdx = startIdx + match[0].length;

	// Check if cursor is within this link
	if (pos.ch < startIdx || pos.ch > endIdx) return undefined;

	const displayText = match[1];
	const link = match[2];

	// Remove .md extension if present (Obsidian convention)
	const cleanLink = link.endsWith('.md') ? link.slice(0, -3) : link;

	return {
		link: cleanLink,
		position: {
			start: {
				col: startIdx,
				line: pos.line,
				offset: -1,
			},
			end: {
				col: endIdx,
				line: pos.line,
				offset: -1,
			},
		},
		original: match[0],
		displayText: displayText || undefined,
	};
}

type LookupFn = (count: number) => string;

export function firstIndexOf(str: string, from: number, predicate: (lookup: LookupFn) => boolean): number {
	const len = str.length;
	const lookupFn: LookupFn = (count) => {
		return str.substring(from, Math.min(from + count, len));
	};
	while (from < len) {
		if (predicate(lookupFn)) {
			return from;
		}
		from++;
	}
	return -1;
}

export function lastIndexOf(str: string, from: number, predicate: (lookup: LookupFn) => boolean): number {
	const len = str.length;
	const lookupFn: LookupFn = (count) => {
		return str.substring(from, Math.min(from + count, len));
	};
	while (from > 0) {
		from--;
		if (predicate(lookupFn)) {
			return from;
		}
	}
	return -1;
}

/**
 *
 * @param link
 * @returns Pos of link text where the Pos.start points to the link pipe character
 */
export function getLinkTextPosWithPipe(link: ReferenceCache): Pos {
	//empty string in display text should be handled here too
	if (link.displayText != null) {
		return {
			start: moveLoc(link.position.end, -link.displayText.length - 3),
			end: moveLoc(link.position.end, -2),
		};
	}
	return {
		start: moveLoc(link.position.end, -2),
		end: moveLoc(link.position.end, -2),
	};
}

function isMarkdownLink(link: ReferenceCache): boolean {
	return link.original.startsWith('[') && link.original.includes('](');
}

/**
 * Sets the link text of `link` to be a `linkText`
 * @param link
 * @param editor
 * @param linkText
 */
export function setLinkText(link: ReferenceCache, editor: Editor, linkText: string | undefined): void {
	if (link.displayText === linkText) return; // No change needed

	if (isMarkdownLink(link)) {
		// Handle markdown link: [text](url)
		setMarkdownLinkText(link, editor, linkText);
	} else {
		// Handle wiki link: [[url|text]]
		setWikiLinkText(link, editor, linkText);
	}

	link.displayText = linkText;
}

function setWikiLinkText(link: ReferenceCache, editor: Editor, linkText: string | undefined): void {
	// Current implementation for wiki links
	const linkTextPos = getLinkTextPosWithPipe(link);
	editor.replaceRange(
		linkText != null ? `|${linkText}` : "",
		locToEditorPositon(linkTextPos.start),
		locToEditorPositon(linkTextPos.end)
	);
}

function setMarkdownLinkText(link: ReferenceCache, editor: Editor, linkText: string | undefined): void {
	// For markdown links, we need to replace just the text part in [text](url)
	const match = link.original.match(/\[([^\]]*)\]/);
	if (!match) return;

	const textStart = link.position.start.col + 1; // After '['
	const textEnd = textStart + match[1].length;

	const newText = linkText || '';

	editor.replaceRange(
		newText,
		{ line: link.position.start.line, ch: textStart },
		{ line: link.position.start.line, ch: textEnd }
	);
}

/**
 * Removes link formatting from a link, preserving only the display text or link target
 * @param link The link to unlink
 * @param editor The editor instance
 * @returns The preserved text (display text if exists, otherwise link target)
 */
export function removeLinkFormatting(link: ReferenceCache, editor: Editor): string {
	// Determine what text to preserve (display text if exists, otherwise link target)
	const preservedText = link.displayText || link.link;

	// Replace the entire link with just the text
	editor.replaceRange(
		preservedText,
		locToEditorPositon(link.position.start),
		locToEditorPositon(link.position.end)
	);

	return preservedText;
}
