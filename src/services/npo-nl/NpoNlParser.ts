import { NpoNlApi } from '@/npo-nl/NpoNlApi';
import { ScrobbleParser } from '@common/ScrobbleParser';
import { EpisodeItem, MovieItem } from '@models/Item';

class _NpoNlParser extends ScrobbleParser {
	constructor() {
		super(NpoNlApi, {
      watchingUrlRegex: /\(?:\/video\/|\/serie\/[^\/]+\/)([^\/]+)\/?$/, 
      watchingUrlRegex: /\/video|serie\/.+?\/.+?\/(?<id>.+?)\/afspelen\//, // https://www.vrt.be/vrtnu/a-z/dertigers/3/dertigers-s3a1/
		});
	}
  // https://npo.nl/start/video/de-bende-van-oss_8
  // https://npo.nl/start/video/la-verite
  // https://npo.nl/start/serie/3doc/seizoen-20/3doc-coos-en-de-colafles/afspelen
  // https://npo.nl/start/serie/draadstaal/seizoen-14/draadstaal-verkiezingsspecial_2/afspelen
  
	parseItemFromDom() {
		const serviceId = this.api.id;
		let showTitle: string | null = null;
		let seasonOrYear: string | null = null;
		let seasonAndEpisode: string | undefined = undefined;
		let id: string | undefined = undefined;
		let seasonStr: string | undefined = undefined;
		let episodeStr: string | undefined = undefined;

		const matches =
			/\/video|serie\/(?<showTitle>.+?)\/(?<seasonOrYear>.+?)\/(?<id>.+?)\//.exec(
				this.getLocation()
			);

		if (matches?.groups) {
			({ showTitle, seasonOrYear, id, seasonAndEpisode, seasonStr, episodeStr } = matches.groups);
		}

		if (!id) {
			return null;
		}

		const title = showTitle?.split('-').join(' ') ?? '';

		if (seasonAndEpisode) {
			const season = parseInt(seasonStr ?? '') || 0;
			const number = parseInt(episodeStr ?? '') || 0;

			return new EpisodeItem({
				serviceId,
				id,
				title: '',
				season,
				number,
				show: {
					serviceId,
					id,
					title,
				},
			});
		}

		const year = parseInt(seasonOrYear ?? '') || 0;

		return new MovieItem({
			serviceId,
			id,
			title,
			year,
		});
	}
}

export const NpoNlParser = new _NpoNlParser();
