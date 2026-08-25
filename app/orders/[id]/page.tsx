import { OrderDetailPage } from "@/components/partx/account-pages";
export default async function Page({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <OrderDetailPage id={id}/>; }
