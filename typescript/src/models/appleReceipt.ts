export interface AppleReceipt {
    transaction_id: string,
    bid: string,
    product_id: string,
    original_transaction_id: string,
    item_id: string,
    app_item_id: string,
    web_order_line_item_id: string,
    unique_identifier: string,
    unique_vendor_identifier: string,
    quantity: string,
    purchase_date_ms: string,
    original_purchase_date_ms: string,
    expires_date: string,
    is_in_intro_offer_period: string,
    is_trial_period: string,
    bvrs: string,
    version_external_identifier: string
}