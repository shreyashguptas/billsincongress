import { BillInfo } from '@/lib/types/BillInfo';
import { useBillsStore } from '@/lib/store/bills-store';
import Link from 'next/link';

interface BillCardProps {
  bill: BillInfo;
}

export default function BillCard({ bill }: BillCardProps) {
  const { getProgressColor, getProgressLabel } = useBillsStore();

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow">
      <div className="flex flex-col gap-4">
        <div className="flex justify-between items-start">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            {bill.bill_type_label} {bill.bill_number}
          </h3>
          <div className={`px-3 py-1 rounded-full text-sm ${getProgressColor(bill.progress_stage || 0)} text-white`}>
            {getProgressLabel(bill.progress_stage || 0)}
          </div>
        </div>
        
        <p className="text-gray-600 dark:text-gray-300 line-clamp-2">
          {bill.title_without_number || bill.title}
        </p>

        <div className="flex flex-col gap-2">
          <div className="text-sm text-gray-500 dark:text-gray-400">
            <span className="font-medium">Sponsor:</span>{' '}
            {bill.sponsor_first_name} {bill.sponsor_last_name} ({bill.sponsor_party}-{bill.sponsor_state})
          </div>
          
          <div className="text-sm text-gray-500 dark:text-gray-400">
            <span className="font-medium">Introduced:</span>{' '}
            {new Date(bill.introduced_date).toLocaleDateString()}
          </div>

          {bill.latest_action_text && (
            <div className="text-sm text-gray-500 dark:text-gray-400">
              <span className="font-medium">Latest Action:</span>{' '}
              {new Date(bill.latest_action_date || '').toLocaleDateString()} - {bill.latest_action_text}
            </div>
          )}
        </div>

        <div className="mt-2">
          <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
            <div 
              className={`h-2.5 rounded-full ${getProgressColor(bill.progress_stage || 0)}`}
              style={{ width: `${Math.max(0, bill.progress_stage || 0)}%` }}
            ></div>
          </div>
        </div>

        <Link 
          href={`/bills/${bill.congress}/${bill.bill_type}/${bill.bill_number}`}
          className="mt-2 text-blue-600 dark:text-blue-400 hover:underline text-sm"
        >
          View Details →
        </Link>
      </div>
    </div>
  );
}