/**
 * Rows per page for every paginated table in the portal.
 *
 * One number, one place. Screens had each grown their own `PAGE_SIZE = 10`,
 * which is how two lists of the same length ended up paging differently — and
 * ten rows is too short a page for the registers (fleet, staff, requests) the
 * operators actually scan.
 */
export const PAGE_SIZE = 20;
