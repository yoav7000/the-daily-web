/**
 * Article lifecycle statuses and categories
 * In accordance with course requirements:
 * "בהכנה" (DRAFT), "ממתינה לאישור עורך" (PENDING_APPROVAL), "פורסמה" (PUBLISHED), "הוחזרה לתיקונים" (REVISION_REQUESTED)
 */
const ARTICLE_STATUS = {
    DRAFT: 'draft',                         // "בהכנה"
    PENDING_APPROVAL: 'pending_approval',   // "ממתינה לאישור עורך"
    PUBLISHED: 'published',                 // "פורסמה"
    REVISION_REQUESTED: 'revision_requested'// "הוחזרה לתיקונים"
};

const ARTICLE_STATUS_LABELS_HE = {
    [ARTICLE_STATUS.DRAFT]: 'בהכנה',
    [ARTICLE_STATUS.PENDING_APPROVAL]: 'ממתינה לאישור עורך',
    [ARTICLE_STATUS.PUBLISHED]: 'פורסמה',
    [ARTICLE_STATUS.REVISION_REQUESTED]: 'הוחזרה לתיקונים'
};

const ARTICLE_CATEGORIES = [
    'חדשות',
    'פוליטיקה',
    'כלכלה',
    'טכנולוגיה',
    'ספורט',
    'תרבות',
    'בריאות',
    'דעות'
];

// Shown when a reporter does not pick a main image
const DEFAULT_ARTICLE_IMAGE = '/images/default-article.svg';

module.exports = {
    ARTICLE_STATUS,
    ARTICLE_STATUS_LABELS_HE,
    ARTICLE_CATEGORIES,
    DEFAULT_ARTICLE_IMAGE
};
