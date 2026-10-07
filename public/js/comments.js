// Comment list helpers. A new comment is added to the top of the list that is already on screen,
// the list is never fetched again. Needs common.js (escapeHtml).

const EMPTY_COMMENTS_HTML = '<div data-empty-comments class="text-center text-muted small py-3">אין עדיין תגובות לכתבה זו. היו הראשונים להגיב!</div>';

function createCommentElement(comment) {
    const date = new Date(comment.createdAt || Date.now());
    const item = document.createElement('div');
    item.className = 'p-3 bg-white rounded border small';
    item.innerHTML = `
        <div class="d-flex justify-content-between text-muted mb-2" style="font-size: 0.8rem;">
            <strong class="text-primary">${escapeHtml(comment.authorName)}</strong>
            <span>${date.toLocaleDateString('he-IL')} ${date.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
        <div class="text-dark">${escapeHtml(comment.content)}</div>
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
