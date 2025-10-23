// Content script to replace words on webpages with tooltips showing original text

// replacement words, followed by list of words to be replaced.
// Sorted by length of target phrases (longest first) to avoid conflicts
searchWordList = [
    ["temporary accommodation", ["migrant hotel", "migrant hotels", 
                                 "asylum hotel", "asylum hotels", 
                                 "asylum seeker hotel", "asylum seeker hotels",
                                 "migrant shelter", "migrant shelters"]],
    ["people seeking work opportunities", ["economic migrants"]],
    ["person seeking work opportunities", ["economic migrant"]],
    ["multicultural communities", ["no-go zones", "ghettos"]],
    ["multicultural community", ["no-go zone", "ghetto"]],
    ["families seeking safety", ["refugee families", "asylum seeker families"]],
    ["family seeking safety", ["refugee family", "asylum seeker family"]],
    ["people seeking safety", ["asylum seekers", "refugees"]],
    ["person seeking safety", ["asylum seeker", "refugee"]],
    ["undocumented people", ["illegal immigrants", "illegal migrants", "illegal aliens", "illegals"]],
    ["undocumented person", ["illegal immigrant", "illegal migrant", "illegal alien"]],
    ["family reunification", ["chain migration"]],
    ["foreign workers", ["foreign nationals"]],
    ["expats", ["immigrants", "migrants"]],
    ["expat", ["immigrant", "migrant"]]
];

// Add CSS styles for the replaced text
function addStyles() {
    const style = document.createElement('style');
    style.textContent = `
        .word-replaced {
            background-color: #ffff001a;
            border-bottom: 1px dotted #66666688;
            cursor: help;
            position: relative;
        }
    `;
    document.head.appendChild(style);
}

// Function to preserve the case of the original word
function preserveCase(original, replacement) {
    // If original is all uppercase
    if (original === original.toUpperCase()) {
        return replacement.toUpperCase();
    }
    
    // If original is all lowercase
    if (original === original.toLowerCase()) {
        return replacement.toLowerCase();
    }
    
    // If original is title case (first letter uppercase)
    if (original[0] === original[0].toUpperCase() && original.slice(1) === original.slice(1).toLowerCase()) {
        return replacement.charAt(0).toUpperCase() + replacement.slice(1).toLowerCase();
    }
    
    // For mixed case, try to preserve the pattern
    let result = '';
    for (let i = 0; i < replacement.length; i++) {
        if (i < original.length) {
            if (original[i] === original[i].toUpperCase()) {
                result += replacement[i].toUpperCase();
            } else {
                result += replacement[i].toLowerCase();
            }
        } else {
            // If replacement is longer, use lowercase for extra characters
            result += replacement[i].toLowerCase();
        }
    }
    
    return result;
}




function replaceTextInNode(node) {
    // Only process text nodes and avoid already processed nodes
    if (node.nodeType === Node.TEXT_NODE && !node.parentElement?.classList?.contains('word-replaced')) {
        const originalText = node.textContent;
        let hasReplacements = false;
        let workingText = originalText;
        const replacements = [];

        // Collect all potential replacements with their positions
        searchWordList.forEach(([replacementWord, targetWords]) => {
            targetWords.forEach((targetWord) => {
                const regex = new RegExp(`\\b${targetWord}\\b`, 'gi');
                let match;
                while ((match = regex.exec(originalText)) !== null) {
                    replacements.push({
                        start: match.index,
                        end: match.index + match[0].length,
                        original: match[0],
                        replacement: replacementWord,
                        length: match[0].length
                    });
                }
            });
        });

        // Sort replacements by start position (descending) to avoid index shifting
        replacements.sort((a, b) => b.start - a.start);

        // Remove overlapping replacements (keep the first one found, which should be longest due to our ordering)
        const nonOverlapping = [];
        replacements.forEach(current => {
            const hasOverlap = nonOverlapping.some(existing => 
                (current.start < existing.end && current.end > existing.start)
            );
            if (!hasOverlap) {
                nonOverlapping.push(current);
            }
        });

        // Mark that we have replacements to process
        if (nonOverlapping.length > 0) {
            hasReplacements = true;
        }

        if (hasReplacements && node.parentElement) {
            // Create document fragment and build elements safely
            const fragment = document.createDocumentFragment();
            let lastIndex = 0;
            
            // Sort replacements by start position (ascending) for fragment building
            const sortedReplacements = nonOverlapping.sort((a, b) => a.start - b.start);
            
            sortedReplacements.forEach(replacement => {
                // Add text before replacement
                if (replacement.start > lastIndex) {
                    const textBefore = originalText.substring(lastIndex, replacement.start);
                    if (textBefore) {
                        fragment.appendChild(document.createTextNode(textBefore));
                    }
                }
                
                // Create span element safely
                const span = document.createElement('span');
                span.className = 'word-replaced';
                span.setAttribute('data-original', replacement.original);
                span.setAttribute('title', `Replaced Phrase: ${replacement.original}`);
                span.textContent = preserveCase(replacement.original, replacement.replacement);
                fragment.appendChild(span);
                
                lastIndex = replacement.end;
            });
            
            // Add remaining text
            if (lastIndex < originalText.length) {
                const textAfter = originalText.substring(lastIndex);
                if (textAfter) {
                    fragment.appendChild(document.createTextNode(textAfter));
                }
            }
            
            node.parentElement.replaceChild(fragment, node);
        }
    } else if (node.nodeType === Node.ELEMENT_NODE && !node.classList?.contains('word-replaced')) {
        // Recursively process child nodes
        const childNodes = Array.from(node.childNodes);
        childNodes.forEach(child => {
            replaceTextInNode(child);
        });
    }
}

// Function to replace text in the entire document
function replaceAllText() {
    // Add CSS styles first
    addStyles();
    
    // Process all text nodes in the document
    const walker = document.createTreeWalker(
        document.body || document.documentElement,
        NodeFilter.SHOW_TEXT,
        {
            acceptNode: function (node) {
                // Skip text nodes that are children of script or style elements
                const parent = node.parentElement;
                if (parent && (parent.tagName === 'SCRIPT' || parent.tagName === 'STYLE')) {
                    return NodeFilter.FILTER_REJECT;
                }
                // Skip already processed nodes
                if (parent && parent.classList && parent.classList.contains('word-replaced')) {
                    return NodeFilter.FILTER_REJECT;
                }
                return NodeFilter.FILTER_ACCEPT;
            }
        }
    );

    const textNodes = [];
    let currentNode;

    // Collect all text nodes first to avoid live NodeList issues
    while (currentNode = walker.nextNode()) {
        textNodes.push(currentNode);
    }

    // Process each text node
    textNodes.forEach(node => {
        replaceTextInNode(node);
    });
}

// Wait for the DOM to be ready, then replace text
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', replaceAllText);
} else {
    // DOM is already ready
    replaceAllText();
}

// Also watch for dynamic content changes
const observer = new MutationObserver(function (mutations) {
    mutations.forEach(function (mutation) {
        mutation.addedNodes.forEach(function (node) {
            if (node.nodeType === Node.ELEMENT_NODE || node.nodeType === Node.TEXT_NODE) {
                replaceTextInNode(node);
            }
        });
    });
});

// Start observing
if (document.body) {
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
}