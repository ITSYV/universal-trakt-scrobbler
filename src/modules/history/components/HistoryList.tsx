import { List } from '@material-ui/core';
import * as React from 'react';
import { MissingWatchedDateDialog } from '../../../components/MissingWatchedDateDialog';
import { WrongItemDialog } from '../../../components/WrongItemDialog';
import { Item } from '../../../models/Item';
import { StreamingServiceId } from '../../../streaming-services/streaming-services';
import { HistoryListItem } from './HistoryListItem';

interface HistoryListProps {
	dateFormat: string;
	items: Item[];
	serviceId: StreamingServiceId | null;
	sendReceiveSuggestions: boolean;
}

export const HistoryList: React.FC<HistoryListProps> = (props: HistoryListProps) => {
	const { dateFormat, items, serviceId, sendReceiveSuggestions } = props;

	return (
		<>
			<List className="history-list">
				{items.map((item) => (
					<HistoryListItem
						key={item.index}
						dateFormat={dateFormat}
						item={item}
						serviceId={serviceId}
						sendReceiveSuggestions={sendReceiveSuggestions}
					/>
				))}
			</List>
			<MissingWatchedDateDialog />
			<WrongItemDialog />
		</>
	);
};
