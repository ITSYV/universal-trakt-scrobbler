import { Box, CircularProgress, Typography } from '@material-ui/core';
import * as PropTypes from 'prop-types';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { TmdbApi } from '../../../api/TmdbApi';
import { TraktSettings } from '../../../api/TraktSettings';
import { TraktSync } from '../../../api/TraktSync';
import { WrongItemApi } from '../../../api/WrongItemApi';
import { BrowserStorage } from '../../../common/BrowserStorage';
import { Errors } from '../../../common/Errors';
import {
	EventDispatcher,
	HistoryOptionsChangeData,
	HistorySyncSuccessData,
	MissingWatchedDateAddedData,
	SyncStoreUpdateData,
	WrongItemCorrectedData,
} from '../../../common/Events';
import { I18N } from '../../../common/I18N';
import { RequestException } from '../../../common/Requests';
import { UtsCenter } from '../../../components/UtsCenter';
import { Api } from '../../../streaming-services/common/Api';
import { getApi, getSyncStore } from '../../../streaming-services/common/common';
import {
	StreamingServiceId,
	streamingServices,
} from '../../../streaming-services/streaming-services';
import { HistoryActions } from '../components/HistoryActions';
import { HistoryList } from '../components/HistoryList';
import { HistoryOptionsList } from '../components/HistoryOptionsList';

interface PageProps {
	serviceId: StreamingServiceId | null;
}

export const SyncPage: React.FC<PageProps> = (props: PageProps) => {
	const { serviceId } = props;

	const service = serviceId ? streamingServices[serviceId] : null;
	const store = getSyncStore(serviceId);
	const api = serviceId ? getApi(serviceId) : null;

	const [_, setSyncOptionsChanged] = useState({});
	const [content, setContent] = useState({
		isLoading: serviceId ? store.data.page === 0 : false,
		itemsChanged: {},
		visibleItemsChanged: {},
	});
	const [dateFormat, setDateFormat] = useState('MMMM Do YYYY, H:mm:ss');

	const loadPreviousPage = () => {
		void store.goToPreviousPage().update();
	};

	const loadNextPage = () => {
		if (!service || !serviceId) {
			return;
		}
		const itemsToLoad = (store.data.page + 1) * store.data.itemsPerPage - store.data.items.length;
		if (itemsToLoad > 0 && !store.data.hasReachedEnd) {
			setContent((prevContent) => ({
				...prevContent,
				isLoading: true,
			}));
			const serviceOptions = BrowserStorage.options.streamingServices[serviceId];
			const [lastSync, lastSyncId] =
				service.hasAutoSync && serviceOptions.autoSync && serviceOptions.autoSyncDays > 0
					? [serviceOptions.lastSync, serviceOptions.lastSyncId]
					: [0, ''];
			EventDispatcher.dispatch('REQUESTS_CANCEL', null, { key: 'default' })
				.then(() => api?.loadHistory(itemsToLoad, lastSync, lastSyncId))
				.then(() => store.goToNextPage().update())
				.catch(() => {
					// Do nothing
				});
		} else {
			const hasNextPage =
				store.data.itemsPerPage > 0 &&
				store.data.page < Math.ceil(store.data.items.length / store.data.itemsPerPage);
			if (hasNextPage) {
				void store.goToNextPage().update();
			}
		}
	};

	const onPreviousPageClick = () => {
		loadPreviousPage();
	};

	const onNextPageClick = () => {
		loadNextPage();
	};

	const onSyncClick = async () => {
		if (!BrowserStorage.syncOptions.addWithReleaseDate) {
			const missingWatchedDate = store.data.selectedItems.find((item) => !item.watchedAt);
			if (missingWatchedDate) {
				return EventDispatcher.dispatch('DIALOG_SHOW', null, {
					title: I18N.translate('cannotSync'),
					message: I18N.translate('cannotSyncMissingWatchedDate'),
				});
			}
		}
		setContent((prevContent) => ({
			...prevContent,
			isLoading: true,
		}));
		await TraktSync.sync(store.data.selectedItems);
		if (serviceId) {
			const lastSync =
				store.data.selectedItems[0].watchedAt?.unix() ?? Math.trunc(Date.now() / 1e3);
			if (lastSync > BrowserStorage.options.streamingServices[serviceId].lastSync) {
				BrowserStorage.addOption({
					id: 'streamingServices',
					value: {
						...BrowserStorage.options.streamingServices,
						[serviceId]: {
							...BrowserStorage.options.streamingServices[serviceId],
							lastSync,
							lastSyncId: store.data.selectedItems[0].id,
						},
					},
				});
			}
			await BrowserStorage.saveOptions({});
			setContent((prevContent) => ({
				...prevContent,
				isLoading: false,
			}));
		} else {
			await BrowserStorage.remove('syncCache');
			store.resetData();
			await store.dispatchEvent(true);
		}
	};

	const onClearSyncCacheClick = async () => {
		await EventDispatcher.dispatch('DIALOG_SHOW', null, {
			title: I18N.translate('confirmClearSyncCacheTitle'),
			message: I18N.translate('confirmClearSyncCacheMessage'),
			onConfirm: async () => {
				await BrowserStorage.remove('syncCache');
				store.resetData();
				await store.dispatchEvent(true);
			},
		});
	};

	const onAddDateClick = async () => {
		await EventDispatcher.dispatch('MISSING_WATCHED_DATE_DIALOG_SHOW', null, {
			serviceId,
			items: store.data.selectedItems.filter((item) => !item.watchedAt),
		});
	};

	useEffect(() => {
		const startListeners = () => {
			EventDispatcher.subscribe('SYNC_STORE_UPDATE', null, onStoreUpdate);
			EventDispatcher.subscribe('STREAMING_SERVICE_HISTORY_LOAD_ERROR', null, onHistoryLoadError);
			EventDispatcher.subscribe('TRAKT_HISTORY_LOAD_ERROR', null, onTraktHistoryLoadError);
			EventDispatcher.subscribe('MISSING_WATCHED_DATE_ADDED', serviceId, onMissingWatchedDateAdded);
			EventDispatcher.subscribe('WRONG_ITEM_CORRECTED', serviceId, onWrongItemCorrected);
			EventDispatcher.subscribe('HISTORY_SYNC_SUCCESS', null, onHistorySyncSuccess);
			EventDispatcher.subscribe('HISTORY_SYNC_ERROR', null, onHistorySyncError);
			store.startListeners();
		};

		const stopListeners = () => {
			EventDispatcher.unsubscribe('SYNC_STORE_UPDATE', null, onStoreUpdate);
			EventDispatcher.unsubscribe('STREAMING_SERVICE_HISTORY_LOAD_ERROR', null, onHistoryLoadError);
			EventDispatcher.unsubscribe('TRAKT_HISTORY_LOAD_ERROR', null, onTraktHistoryLoadError);
			EventDispatcher.unsubscribe(
				'MISSING_WATCHED_DATE_ADDED',
				serviceId,
				onMissingWatchedDateAdded
			);
			EventDispatcher.unsubscribe('WRONG_ITEM_CORRECTED', serviceId, onWrongItemCorrected);
			EventDispatcher.unsubscribe('HISTORY_SYNC_SUCCESS', null, onHistorySyncSuccess);
			EventDispatcher.unsubscribe('HISTORY_SYNC_ERROR', null, onHistorySyncError);
			store.stopListeners();

			void EventDispatcher.dispatch('REQUESTS_CANCEL', null, { key: 'default' });
		};

		const onStoreUpdate = (data: SyncStoreUpdateData) => {
			setContent((prevContent) => ({
				isLoading: false,
				itemsChanged: {},
				visibleItemsChanged: data.visibleItemsChanged ? {} : prevContent.visibleItemsChanged,
			}));
		};

		const onHistoryLoadError = async () => {
			await EventDispatcher.dispatch('SNACKBAR_SHOW', null, {
				messageName: 'loadHistoryError',
				severity: 'error',
			});
		};

		const onTraktHistoryLoadError = async () => {
			await EventDispatcher.dispatch('SNACKBAR_SHOW', null, {
				messageName: 'loadTraktHistoryError',
				severity: 'error',
			});
		};

		const onWrongItemCorrected = async (data: WrongItemCorrectedData): Promise<void> => {
			try {
				if (data.item.trakt?.syncId) {
					await TraktSync.removeHistory(data.item);
				}
			} catch (err) {
				// Do nothing
			}
			const storage = await BrowserStorage.get('traktCache');
			let { traktCache } = storage;
			if (!traktCache) {
				traktCache = {};
			}
			await Api.loadTraktItemHistory(data.item, traktCache, {
				type: data.type,
				traktId: data.traktId,
				url: data.url,
			});
			try {
				await WrongItemApi.saveSuggestion(data.item, data.url);
			} catch (err) {
				if (!(err as RequestException).canceled) {
					Errors.error('Failed to save suggestion.', err);
					await EventDispatcher.dispatch('SNACKBAR_SHOW', null, {
						messageName: 'saveSuggestionFailed',
						severity: 'error',
					});
				}
			}
			await BrowserStorage.set({ traktCache }, false);
			await store.dispatchEvent(true);
		};

		const onMissingWatchedDateAdded = async (data: MissingWatchedDateAddedData): Promise<void> => {
			await store.dispatchEvent(true);
		};

		const onHistorySyncSuccess = async (data: HistorySyncSuccessData) => {
			await EventDispatcher.dispatch('SNACKBAR_SHOW', null, {
				messageArgs: [data.added.episodes.toString(), data.added.movies.toString()],
				messageName: 'historySyncSuccess',
				severity: 'success',
			});
		};

		const onHistorySyncError = async () => {
			await EventDispatcher.dispatch('SNACKBAR_SHOW', null, {
				messageName: 'historySyncError',
				severity: 'error',
			});
		};

		startListeners();
		return stopListeners;
	}, []);

	useEffect(() => {
		const startListeners = () => {
			EventDispatcher.subscribe('HISTORY_OPTIONS_CHANGE', null, onOptionsChange);
		};

		const stopListeners = () => {
			EventDispatcher.unsubscribe('HISTORY_OPTIONS_CHANGE', null, onOptionsChange);
		};

		const onOptionsChange = (data: HistoryOptionsChangeData) => {
			BrowserStorage.saveSyncOptions({ [data.id]: data.value })
				.then(async () => {
					setSyncOptionsChanged({});
					if (serviceId && data.id === 'itemsPerLoad' && typeof data.value === 'number') {
						checkItemsPerPage(data.value);
					} else {
						void store.updateVisibleItems(false);
					}
					await EventDispatcher.dispatch('SNACKBAR_SHOW', null, {
						messageName: 'saveOptionSuccess',
						severity: 'success',
					});
				})
				.catch(async (err) => {
					Errors.error('Failed to save option.', err);
					await EventDispatcher.dispatch('SNACKBAR_SHOW', null, {
						messageName: 'saveOptionFailed',
						severity: 'error',
					});
				});
		};

		const checkItemsPerPage = (itemsPerPage: number) => {
			if (!service || !serviceId) {
				return;
			}
			const itemsToLoad = (store.data.page + 1) * itemsPerPage - store.data.items.length;
			if (itemsToLoad > 0 && !store.data.hasReachedEnd && !content.isLoading) {
				store.setData({ itemsPerPage });
				setContent((prevContent) => ({
					...prevContent,
					isLoading: true,
				}));
				const serviceOptions = BrowserStorage.options.streamingServices[serviceId];
				const [lastSync, lastSyncId] =
					service.hasAutoSync && serviceOptions.autoSync && serviceOptions.autoSyncDays > 0
						? [serviceOptions.lastSync, serviceOptions.lastSyncId]
						: [0, ''];
				EventDispatcher.dispatch('REQUESTS_CANCEL', null, { key: 'default' })
					.then(() => api?.loadHistory(itemsToLoad, lastSync, lastSyncId))
					.then(() => store.update())
					.catch(() => {
						// Do nothing
					});
			} else {
				void store.update({ itemsPerPage });
			}
		};

		startListeners();
		return stopListeners;
	}, [content.isLoading]);

	useEffect(() => {
		const getDateFormat = async () => {
			setDateFormat(await TraktSettings.getTimeAndDateFormat());
		};

		void getDateFormat();
	}, []);

	useEffect(() => {
		const loadFirstPage = () => {
			if (serviceId && store.data.page === 0) {
				store.setData({ itemsPerPage: BrowserStorage.syncOptions.itemsPerLoad });
				loadNextPage();
			}
		};

		loadFirstPage();
	}, []);

	useEffect(() => {
		const loadData = async () => {
			if (content.isLoading) {
				return;
			}
			try {
				await Api.loadTraktHistory(store.data.visibleItems);
				await Promise.all([
					WrongItemApi.loadSuggestions(store.data.visibleItems),
					TmdbApi.loadImages(store.data.visibleItems),
				]);
				await store.dispatchEvent(false);
			} catch (err) {
				// Do nothing
			}
		};

		void loadData();
	}, [content.isLoading, content.visibleItemsChanged]);

	const showNavigationButtons = !!serviceId;
	const hasPreviousPage = showNavigationButtons && store.data.page > 1;
	const hasNextPage =
		showNavigationButtons &&
		(((store.data.page + 1) * store.data.itemsPerPage - store.data.items.length > 0 &&
			!store.data.hasReachedEnd) ||
			(store.data.itemsPerPage > 0 &&
				store.data.page < Math.ceil(store.data.items.length / store.data.itemsPerPage)));
	const hasSelectedItems = store.data.selectedItems.length > 0;
	const showClearSyncCacheButton = !serviceId;
	const showAddDateButton = store.data.selectedItems.filter((item) => !item.watchedAt).length > 1;

	return content.isLoading ? (
		<UtsCenter>
			<CircularProgress />
		</UtsCenter>
	) : (
		<>
			{!serviceId && (
				<Box className="history-container-message">{I18N.translate('autoSyncPageMessage')}</Box>
			)}
			<Box className="history-content">
				<HistoryOptionsList store={store} />
				{store.data.visibleItems.length > 0 ? (
					<HistoryList
						dateFormat={dateFormat}
						items={store.data.visibleItems}
						serviceId={serviceId}
					/>
				) : (
					<Box className="history-content--empty">
						<Typography variant="body1">{I18N.translate('noMoreHistory')}</Typography>
					</Box>
				)}
			</Box>
			<HistoryActions
				showNavigationButtons={showNavigationButtons}
				hasPreviousPage={hasPreviousPage}
				hasNextPage={hasNextPage}
				hasSelectedItems={hasSelectedItems}
				showClearSyncCacheButton={showClearSyncCacheButton}
				showAddDateButton={showAddDateButton}
				onPreviousPageClick={onPreviousPageClick}
				onNextPageClick={onNextPageClick}
				onSyncClick={onSyncClick}
				onClearSyncCacheClick={onClearSyncCacheClick}
				onAddDateClick={onAddDateClick}
			/>
		</>
	);
};

SyncPage.propTypes = {
	serviceId: PropTypes.any,
};