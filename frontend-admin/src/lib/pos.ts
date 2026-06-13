import { requestJson } from '#/lib/api.ts'
import type { TransactionDetail } from '#/lib/transactions.ts'

export interface CheckoutItemPayload {
  product_id: string
  quantity: number
}

export interface CheckoutPaymentPayload {
  payment_method: string
  amount: number
  reference_number?: string | null
}

export interface CheckoutPayload {
  outlet_id: string
  shift_id: string
  discount_amount: number
  items: CheckoutItemPayload[]
  payments: CheckoutPaymentPayload[]
}

export const PAYMENT_METHODS = ['cash', 'qris', 'transfer', 'card'] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]

export function checkout(
  token: string,
  payload: CheckoutPayload,
): Promise<TransactionDetail> {
  return requestJson('/pos/checkout', {
    method: 'POST',
    body: payload,
    token,
  })
}
