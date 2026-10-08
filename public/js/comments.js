// Comment list helpers. A new comment is added to the top of the list that is already on screen,
// the list is never fetched again. Needs common.js (escapeHtml, initialOf).

const EMPTY_COMMENTS_HTML = '<div data-empty-comments class="comment-empty">אין עדיין תגובות לכתבה זו. היו הראשונים להגיב!</div>';

function createCommentElement(comment) {
    const date = new Date(comment.createdAt || Date.now());
    const item = document.createElement('article');
    item.className = 'comment';
    item.innerHTML = `
        <span class="avatar avatar-sm" aria-hidden="true">${escapeHtml(initialOf(comment.authorName))}</span>
        <div class="comment-main">
            <div class="comment-meta">
                <strong>${escapeHtml(comment.authorName)}</strong>
                <time datetime="${escapeHtml(date.toISOString())}">${escapeHtml(formatDateTime(date))}</time>
            </div>
            <p class="comment-text">${escapeHtml(comment.content)}</p>
        </div>
    `;
    return item;
}

// Fills the list with the comments loaded from the server (or an invitation to comment when there are none)
function renderCommentList(listEl, comments) {
    listEl.replaceChildren();
    if (comments.length === 0) {
        listEl.innerHTML = EMPTY_COMMENTS_HTML;
        return;
    }
    comments.forEach((comment) => listEl.appendChild(createCommentElement(comment)));
}

// Puts a comment the visitor just posted at the top, without touching the others
function addCommentToList(listEl, comment) {
    const emptyNotice = listEl.querySelector('[data-empty-comments]');
    if (emptyNotice) {
        emptyNotice.remove();
    }
    listEl.prepend(createCommentElement(comment));
}
