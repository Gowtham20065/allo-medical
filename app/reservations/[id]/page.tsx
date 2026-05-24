import ReservationCheckout from "@/components/reservation-checkout";

type Props = {
  params: {
    id: string;
  };
};

export default function ReservationPage({ params }: Props) {
  return <ReservationCheckout id={params.id} />;
}
