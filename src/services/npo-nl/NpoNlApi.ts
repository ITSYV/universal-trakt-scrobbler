import { NpoNlService } from '@/npo-nl/NpoNlService';
import { ServiceApi } from '@apis/ServiceApi';

class _NpoNlApi extends ServiceApi {
	constructor() {
		super(NpoNlService.id);
	}
}

export const NpoNlApi = new _NpoNlApi();
