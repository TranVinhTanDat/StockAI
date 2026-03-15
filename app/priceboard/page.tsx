import dynamic from 'next/dynamic'

const PriceBoardClient = dynamic(
  () => import('@/components/priceboard/PriceBoardClient'),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-dvh bg-bg">
        <div className="animate-spin w-10 h-10 border-2 border-accent border-t-transparent rounded-full" />
      </div>
    ),
  }
)

export default function PriceboardPage() {
  return <PriceBoardClient />
}
