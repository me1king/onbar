interface OrderItemSummary {
    id: number;
    product_id: number | null;
    quantity: number;
    size?: string;
}

interface OrderItemsSummaryProps {
    items?: OrderItemSummary[];
    productNameMap: ReadonlyMap<number, string>;
    warehouseLocation?: string;
}

export default function OrderItemsSummary({ items, productNameMap, warehouseLocation }: OrderItemsSummaryProps) {
    if (!items?.length) {
        return <span className="text-[10px] italic text-slate-400">No items logged</span>;
    }

    return (
        <ul className="min-w-0 space-y-1">
            {items.map(item => {
                const name = item.product_id === null
                    ? `Unlinked order item #${item.id}`
                    : productNameMap.get(item.product_id) || `Item #${item.product_id}`;
                const normalizedName = name.toLowerCase();
                const isChilled = ['wine', 'beer', 'juice', 'soda'].some(word => normalizedName.includes(word));

                return (
                    <li key={item.id} className="flex min-w-0 items-center justify-between gap-2 rounded-lg px-2 py-1.5 odd:bg-slate-50/80">
                        <div className="min-w-0">
                            <p title={name} className="truncate text-[11px] font-bold text-slate-800">{name}</p>
                            <p className="mt-0.5 truncate text-[9px] font-medium text-slate-400">
                                <span className={isChilled ? 'text-sky-600' : 'text-amber-600'}>
                                    {isChilled ? 'Chilled' : 'Dry shelf'}
                                </span>
                                {item.size ? ` · ${item.size}` : ''}
                                {warehouseLocation ? ` · ${warehouseLocation.split(' ')[0]}` : ''}
                            </p>
                        </div>
                        <span className="shrink-0 rounded-full bg-white px-2 py-1 text-[10px] font-black text-slate-600 ring-1 ring-slate-200">
                            ×{item.quantity}
                        </span>
                    </li>
                );
            })}
        </ul>
    );
}
