const { html } = window;

export function SortableHeader({ label, field, sortField, sortAsc, onSort, className = '', style = '' }) {
    const active = sortField === field;
    const directionClass = active ? (sortAsc ? 'asc' : 'desc') : '';
    const ariaSort = active ? (sortAsc ? 'ascending' : 'descending') : 'none';
    const sortLabel = active
        ? `Sort by ${label} ${sortAsc ? 'descending' : 'ascending'}`
        : `Sort by ${label}`;

    return html`
        <th class=${className} style=${style} aria-sort=${ariaSort}>
            <button type="button"
                    class=${`table-sort ${directionClass}`.trim()}
                    aria-label=${sortLabel}
                    title=${sortLabel}
                    onClick=${() => onSort?.(field)}>
                ${label}
            </button>
        </th>
    `;
}

export function PaginationBar({ page = 1, pageSize = 25, total = 0, onPageChange, onPageSizeChange, itemLabel = 'rows', pageSizeOptions = [10, 25, 50, 100] }) {
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(Math.max(1, page), totalPages);
    const start = total === 0 ? 0 : ((safePage - 1) * pageSize) + 1;
    const end = Math.min(total, safePage * pageSize);
    const pages = [];
    const first = Math.max(1, safePage - 2);
    const last = Math.min(totalPages, safePage + 2);
    for (let index = first; index <= last; index += 1) pages.push(index);

    return html`
        <div class="card-footer d-flex align-items-center justify-content-between gap-3 flex-wrap">
            <div class="d-flex align-items-center gap-2 text-muted small">
                <span>Showing <strong>${start}</strong> to <strong>${end}</strong> of <strong>${total}</strong> ${itemLabel}</span>
                <select class="form-select form-select-sm" style="width:auto;"
                        value=${pageSize}
                        onChange=${event => onPageSizeChange?.(Number(event.target.value) || pageSize)}>
                    ${pageSizeOptions.map(size => html`<option value=${size} selected=${size === pageSize}>${size} / page</option>`)}
                </select>
            </div>
            <ul class="pagination m-0">
                <li class=${`page-item ${safePage <= 1 ? 'disabled' : ''}`}>
                    <button class="page-link" type="button" disabled=${safePage <= 1} onClick=${() => onPageChange?.(safePage - 1)}>
                        <i class="ti ti-chevron-left"></i>
                    </button>
                </li>
                ${first > 1 ? html`
                    <li class="page-item"><button class="page-link" type="button" onClick=${() => onPageChange?.(1)}>1</button></li>
                    ${first > 2 ? html`<li class="page-item disabled"><span class="page-link">...</span></li>` : ''}
                ` : ''}
                ${pages.map(number => html`
                    <li class=${`page-item ${number === safePage ? 'active' : ''}`}>
                        <button class="page-link" type="button" onClick=${() => onPageChange?.(number)}>${number}</button>
                    </li>
                `)}
                ${last < totalPages ? html`
                    ${last < totalPages - 1 ? html`<li class="page-item disabled"><span class="page-link">...</span></li>` : ''}
                    <li class="page-item"><button class="page-link" type="button" onClick=${() => onPageChange?.(totalPages)}>${totalPages}</button></li>
                ` : ''}
                <li class=${`page-item ${safePage >= totalPages ? 'disabled' : ''}`}>
                    <button class="page-link" type="button" disabled=${safePage >= totalPages} onClick=${() => onPageChange?.(safePage + 1)}>
                        <i class="ti ti-chevron-right"></i>
                    </button>
                </li>
            </ul>
        </div>
    `;
}

export function SkeletonTable({ columns = 6, rows = 8 }) {
    return html`
        <div class="card">
            <div class="table-responsive">
                <table class="table table-vcenter card-table">
                    <tbody>
                        ${Array.from({ length: rows }).map(() => html`
                            <tr>
                                ${Array.from({ length: columns }).map(() => html`
                                    <td><div class="placeholder placeholder-xs col-10"></div></td>
                                `)}
                            </tr>
                        `)}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

export function FilterToolbar({ children, resultCount, totalCount, onClear, activeFilters = [] }) {
    const showClear = Boolean(onClear && activeFilters.length);

    return html`
        <div class="card mb-3">
            <div class="card-body py-3">
                <div class="d-flex align-items-end gap-3 flex-wrap">
                    ${children}
                    <div class="ms-auto d-flex align-items-center gap-2 flex-wrap">
                        ${activeFilters.map(filter => html`<span class="badge bg-blue-lt text-blue">${filter}</span>`)}
                        <span class="text-muted small">${resultCount} of ${totalCount}</span>
                        ${showClear ? html`
                            <button class="btn btn-sm btn-ghost-secondary" type="button" onClick=${onClear}>Clear</button>
                        ` : ''}
                    </div>
                </div>
            </div>
        </div>
    `;
}

export function PortalDataGrid({ title, items = [], actions = null }) {
    return html`
        <div class="card">
            ${title || actions ? html`
                <div class="card-header">
                    ${title ? html`<h3 class="card-title">${title}</h3>` : ''}
                    ${actions ? html`<div class="card-actions">${actions}</div>` : ''}
                </div>
            ` : ''}
            <div class="card-body">
                <dl class="datagrid">
                    ${items.map(item => html`
                        <div class="datagrid-item">
                            <dt class="datagrid-title">${item.label}</dt>
                            <dd class="datagrid-content">${item.value}</dd>
                        </div>
                    `)}
                </dl>
            </div>
        </div>
    `;
}